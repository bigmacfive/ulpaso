#!/usr/bin/env python3
"""Benchmark Ulpaso's local streaming ASR against timed podcast captions.

The script intentionally consumes local WAV/JSON3 assets. Fetching copyrighted
media stays an explicit, temporary development step and no media is committed.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import sys
import time
import unicodedata
import wave
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence


ANNOTATION_RE = re.compile(r"\[[^\]]*]|\([^)]*(?:music|applause|laughter|음악|박수|웃음)[^)]*\)", re.I)
ENGLISH_WORD_RE = re.compile(r"[a-z0-9]+(?:'[a-z0-9]+)?")
KOREAN_WORD_RE = re.compile(r"[가-힣]+|[a-z0-9]+(?:'[a-z0-9]+)?")


def parse_youtube_json3(path: Path, start_seconds: float, end_seconds: float) -> str:
    payload = json.loads(path.read_text("utf-8"))
    parts: list[str] = []
    start_ms = int(start_seconds * 1000)
    end_ms = int(end_seconds * 1000)
    for event in payload.get("events", []):
        event_start = int(event.get("tStartMs", 0))
        duration = int(event.get("dDurationMs", 0))
        if event_start + max(1, duration) <= start_ms or event_start >= end_ms:
            continue
        text = "".join(str(segment.get("utf8", "")) for segment in event.get("segs", []))
        text = text.replace("\n", " ").strip()
        if text:
            parts.append(text)
    return " ".join(parts)


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = ANNOTATION_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def character_units(text: str) -> list[str]:
    normalized = normalize_text(text)
    return [character for character in normalized if character.isalnum()]


def word_units(text: str, language: str) -> list[str]:
    normalized = normalize_text(text)
    matcher = KOREAN_WORD_RE if language.lower().startswith("korean") else ENGLISH_WORD_RE
    return matcher.findall(normalized)


def edit_distance(reference: Sequence[str], hypothesis: Sequence[str]) -> int:
    if len(reference) < len(hypothesis):
        reference, hypothesis = hypothesis, reference
    previous = list(range(len(hypothesis) + 1))
    for ref_index, ref_item in enumerate(reference, 1):
        current = [ref_index]
        for hyp_index, hyp_item in enumerate(hypothesis, 1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[hyp_index] + 1,
                    previous[hyp_index - 1] + (ref_item != hyp_item),
                )
            )
        previous = current
    return previous[-1]


def error_rate(reference: Sequence[str], hypothesis: Sequence[str]) -> float:
    if not reference:
        return 0.0 if not hypothesis else 1.0
    return edit_distance(reference, hypothesis) / len(reference)


def percentile(values: Sequence[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1))
    return ordered[index]


def read_wav(path: Path) -> tuple[Any, int]:
    import numpy as np

    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        sample_rate = source.getframerate()
        width = source.getsampwidth()
        frames = source.readframes(source.getnframes())
    if width == 2:
        audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    elif width == 4:
        audio = np.frombuffer(frames, dtype="<f4").astype(np.float32, copy=False)
    else:
        raise ValueError(f"unsupported WAV width: {width}")
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, sample_rate


def slice_audio_range(audio: Any, sample_rate: int, start_seconds: float, end_seconds: float):
    start = max(0, int(start_seconds * sample_rate))
    end = max(start, int(end_seconds * sample_rate))
    return audio[start:end]


def apply_korean_spacing_fix() -> None:
    """Korean uses word spacing unlike Chinese/Japanese chunk joining."""
    import mlx_qwen3_asr.streaming as streaming

    for alias in ("korean", "ko", "kr"):
        streaming._CJK_LANG_ALIASES.discard(alias)


def benchmark_sample(
    session: Any,
    sample: dict[str, Any],
    assets_dir: Path,
    *,
    chunk_seconds: float,
    force_language: bool,
    endpointing_mode: str,
    sanitizer: Callable[[str, str | None], str] | None,
    offline_transcriber: Callable[[Any, Any, int], str] | None,
    rolling_refine_seconds: float,
) -> dict[str, Any]:
    import numpy as np

    audio, sample_rate = read_wav(assets_dir / f"{sample['id']}.wav")
    if sample_rate != 16_000:
        raise ValueError(f"{sample['id']} must be 16 kHz, got {sample_rate}")
    reference = parse_youtube_json3(
        assets_dir / sample["subtitle"],
        float(sample.get("startSeconds", 0)),
        float(sample["endSeconds"]),
    )
    audio = slice_audio_range(
        audio,
        sample_rate,
        float(sample.get("startSeconds", 0)),
        float(sample["endSeconds"]),
    )
    audio = np.asarray(audio, dtype=np.float32)
    chunk_samples = int(chunk_seconds * sample_rate)
    state = session.init_streaming(
        context="",
        language=sample["language"] if force_language else None,
        unfixed_chunk_num=1,
        unfixed_token_num=2,
        chunk_size_sec=chunk_seconds,
        max_context_sec=30.0,
        endpointing_mode=endpointing_mode,
        finalization_mode="accuracy",
    )

    feed_times: list[float] = []
    first_text_audio_seconds: float | None = None
    first_stable_audio_seconds: float | None = None
    stable_rewrites = 0
    last_stable = ""
    started = time.perf_counter()
    for offset in range(0, len(audio), chunk_samples):
        chunk = audio[offset : offset + chunk_samples]
        before = time.perf_counter()
        state = session.feed_audio(chunk, state)
        feed_times.append(time.perf_counter() - before)
        audio_seconds = min(len(audio), offset + len(chunk)) / sample_rate
        text = str(getattr(state, "text", "") or "")
        stable = str(getattr(state, "stable_text", "") or "")
        if text and first_text_audio_seconds is None:
            first_text_audio_seconds = audio_seconds
        if stable and first_stable_audio_seconds is None:
            first_stable_audio_seconds = audio_seconds
        if last_stable and stable and not stable.startswith(last_stable):
            stable_rewrites += 1
        if stable:
            last_stable = stable

    detected_language = str(getattr(state, "language", "unknown") or "unknown")
    live_text = str(getattr(state, "text", "") or "").strip()
    live_stable = str(getattr(state, "stable_text", "") or "").strip()
    state.enable_tail_refine = False
    state = session.finish_streaming(state)
    finished_text = str(getattr(state, "text", "") or "").strip()
    wall_seconds = time.perf_counter() - started
    if sanitizer is not None:
        live_text = sanitizer(live_text, detected_language)
        live_stable = sanitizer(live_stable, detected_language)
        finished_text = sanitizer(finished_text, detected_language)

    offline_text = ""
    offline_seconds = 0.0
    if offline_transcriber is not None:
        offline_started = time.perf_counter()
        offline_text = offline_transcriber(session, audio, sample_rate)
        offline_seconds = time.perf_counter() - offline_started

    reference_chars = character_units(reference)
    reference_words = word_units(reference, sample["language"])
    result = {
        "id": sample["id"],
        "title": sample["title"],
        "language": sample["language"],
        "referenceQuality": sample["referenceQuality"],
        "audioSeconds": round(len(audio) / sample_rate, 3),
        "referenceCharacters": len(reference_chars),
        "referenceWords": len(reference_words),
        "firstTextAudioSeconds": first_text_audio_seconds,
        "firstStableAudioSeconds": first_stable_audio_seconds,
        "stableRewrites": stable_rewrites,
        "feedP50Seconds": round(statistics.median(feed_times), 4) if feed_times else 0.0,
        "feedP95Seconds": round(percentile(feed_times, 0.95), 4),
        "realTimeFactor": round(wall_seconds / max(0.001, len(audio) / sample_rate), 4),
        "liveCer": round(error_rate(reference_chars, character_units(live_text)), 4),
        "stableCer": round(error_rate(reference_chars, character_units(live_stable)), 4),
        "finishedCer": round(error_rate(reference_chars, character_units(finished_text)), 4),
        "liveWer": round(error_rate(reference_words, word_units(live_text, sample["language"])), 4),
        "finishedWer": round(error_rate(reference_words, word_units(finished_text, sample["language"])), 4),
        "detectedLanguage": detected_language,
        "reference": reference,
        "liveText": live_text,
        "finishedText": finished_text,
    }
    if offline_transcriber is not None:
        result.update({
            "offlineCer": round(error_rate(reference_chars, character_units(offline_text)), 4),
            "offlineWer": round(error_rate(reference_words, word_units(offline_text, sample["language"])), 4),
            "offlineSeconds": round(offline_seconds, 4),
            "offlineText": offline_text,
        })
    if rolling_refine_seconds > 0:
        rolling_chunk_samples = max(1, int(rolling_refine_seconds * sample_rate))
        rolling_parts: list[str] = []
        rolling_feed_times: list[float] = []
        rolling_started = time.perf_counter()
        for block_start in range(0, len(audio), rolling_chunk_samples):
            block = audio[block_start:block_start + rolling_chunk_samples]
            rolling_state = session.init_streaming(
                context="",
                language=sample["language"] if force_language else None,
                unfixed_chunk_num=1,
                unfixed_token_num=2,
                chunk_size_sec=chunk_seconds,
                max_context_sec=30.0,
                endpointing_mode=endpointing_mode,
                finalization_mode="accuracy",
            )
            for offset in range(0, len(block), chunk_samples):
                chunk = block[offset:offset + chunk_samples]
                before = time.perf_counter()
                rolling_state = session.feed_audio(chunk, rolling_state)
                rolling_feed_times.append(time.perf_counter() - before)
            before = time.perf_counter()
            # Use the same accuracy path as the packaged worker. The benchmark's
            # offline transcriber is already bound to that implementation.
            block_text = offline_transcriber(session, block, sample_rate) if offline_transcriber else ""
            rolling_feed_times[-1] += time.perf_counter() - before
            if sanitizer is not None:
                block_text = sanitizer(block_text, sample["language"])
            if block_text:
                rolling_parts.append(block_text)
        rolling_text = " ".join(rolling_parts).strip()
        rolling_wall_seconds = time.perf_counter() - rolling_started
        result.update({
            "rollingRefineSeconds": rolling_refine_seconds,
            "rollingCer": round(error_rate(reference_chars, character_units(rolling_text)), 4),
            "rollingWer": round(error_rate(reference_words, word_units(rolling_text, sample["language"])), 4),
            "rollingFeedP95Seconds": round(percentile(rolling_feed_times, 0.95), 4),
            "rollingFeedMaxSeconds": round(max(rolling_feed_times, default=0.0), 4),
            "rollingRealTimeFactor": round(rolling_wall_seconds / max(0.001, len(audio) / sample_rate), 4),
            "rollingText": rolling_text,
        })
    return result


def summarize(results: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = list(results)
    manual = [row for row in rows if row["referenceQuality"] == "manual"]
    trusted = manual or rows
    summary = {
        "sampleCount": len(rows),
        "manualReferenceCount": len(manual),
        "meanTrustedCer": round(statistics.mean(row["finishedCer"] for row in trusted), 4),
        "meanTrustedWer": round(statistics.mean(row["finishedWer"] for row in trusted), 4),
        "maxFeedP95Seconds": max((row["feedP95Seconds"] for row in rows), default=0.0),
        "maxFirstStableAudioSeconds": max(
            (row["firstStableAudioSeconds"] or 0.0 for row in rows), default=0.0
        ),
        "stableRewriteCount": sum(row["stableRewrites"] for row in rows),
    }
    if trusted and all("offlineCer" in row for row in trusted):
        summary.update({
            "meanTrustedOfflineCer": round(statistics.mean(row["offlineCer"] for row in trusted), 4),
            "meanTrustedOfflineWer": round(statistics.mean(row["offlineWer"] for row in trusted), 4),
        })
    if trusted and all("rollingCer" in row for row in trusted):
        summary.update({
            "meanTrustedRollingCer": round(statistics.mean(row["rollingCer"] for row in trusted), 4),
            "meanTrustedRollingWer": round(statistics.mean(row["rollingWer"] for row in trusted), 4),
            "maxRollingFeedP95Seconds": max(row["rollingFeedP95Seconds"] for row in rows),
            "maxRollingFeedSeconds": max(row["rollingFeedMaxSeconds"] for row in rows),
            "maxRollingRealTimeFactor": max(row["rollingRealTimeFactor"] for row in rows),
        })
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path("benchmarks/podcast_samples.json"))
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sample", action="append", default=[])
    parser.add_argument("--chunk-seconds", type=float, default=2.0)
    parser.add_argument("--force-language", action="store_true")
    parser.add_argument("--korean-spacing-fix", action="store_true")
    parser.add_argument("--endpointing-mode", choices=("energy", "fixed"), default="energy")
    parser.add_argument("--sanitize-scripts", action="store_true")
    parser.add_argument("--offline-final", action="store_true")
    parser.add_argument("--offline-window-seconds", type=float, default=30.0)
    parser.add_argument("--adaptive-final", action="store_true")
    parser.add_argument("--rolling-refine-seconds", type=float, default=0.0)
    parser.add_argument(
        "--worker-dir",
        type=Path,
        default=Path("src-tauri/resources/asr"),
    )
    args = parser.parse_args()

    import mlx.core as mx
    from mlx_qwen3_asr import Session

    if args.korean_spacing_fix:
        apply_korean_spacing_fix()
    sanitizer = None
    offline_transcriber = None
    if args.sanitize_scripts or args.offline_final:
        sys.path.insert(0, str(args.worker_dir.resolve()))
        from asr_worker import (
            sanitize_stream_text,
            transcribe_audio_adaptive,
            transcribe_audio_windowed,
        )

        sanitizer = sanitize_stream_text if args.sanitize_scripts else None
        if args.offline_final:
            if args.adaptive_final:
                offline_transcriber = transcribe_audio_adaptive
            else:
                offline_transcriber = lambda session, audio, sample_rate: transcribe_audio_windowed(
                    session,
                    audio,
                    sample_rate,
                    max_window_sec=args.offline_window_seconds,
                )
    mx.set_cache_limit(512 * 1024 * 1024)
    samples = json.loads(args.manifest.read_text("utf-8"))
    if args.sample:
        wanted = set(args.sample)
        samples = [sample for sample in samples if sample["id"] in wanted]
    session = Session(model=str(args.model))
    results = []
    for sample in samples:
        print(f"benchmarking {sample['id']} · {sample['title']}", flush=True)
        results.append(
            benchmark_sample(
                session,
                sample,
                args.assets_dir,
                chunk_seconds=args.chunk_seconds,
                force_language=args.force_language,
                endpointing_mode=args.endpointing_mode,
                sanitizer=sanitizer,
                offline_transcriber=offline_transcriber,
                rolling_refine_seconds=args.rolling_refine_seconds,
            )
        )
        print(
            f"  finished CER={results[-1]['finishedCer']:.3f} "
            f"WER={results[-1]['finishedWer']:.3f} "
            f"p95={results[-1]['feedP95Seconds']:.2f}s",
            flush=True,
        )
    payload = {
        "model": str(args.model),
        "chunkSeconds": args.chunk_seconds,
        "forceLanguage": args.force_language,
        "koreanSpacingFix": args.korean_spacing_fix,
        "endpointingMode": args.endpointing_mode,
        "sanitizeScripts": args.sanitize_scripts,
        "offlineFinal": args.offline_final,
        "offlineWindowSeconds": args.offline_window_seconds,
        "adaptiveFinal": args.adaptive_final,
        "rollingRefineSeconds": args.rolling_refine_seconds,
        "summary": summarize(results),
        "samples": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
