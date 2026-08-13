#!/usr/bin/env python3
"""Time-aligned full-video ASR benchmark for Ulpaso's accuracy pass."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any

from podcast_asr_benchmark import (
    character_units,
    edit_distance,
    percentile,
    read_wav,
    word_units,
)


def caption_events(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text("utf-8"))
    events: list[dict[str, Any]] = []
    for event in payload.get("events", []):
        start = float(event.get("tStartMs", 0)) / 1000.0
        duration = float(event.get("dDurationMs", 0)) / 1000.0
        text = "".join(str(segment.get("utf8", "")) for segment in event.get("segs", []))
        text = " ".join(text.replace("\n", " ").split())
        if text:
            events.append({
                "start": start,
                "end": start + max(0.001, duration),
                "midpoint": start + max(0.001, duration) / 2.0,
                "text": text,
            })
    return events


def reference_for_window(events: list[dict[str, Any]], start: float, end: float) -> str:
    return " ".join(event["text"] for event in events if start <= event["midpoint"] < end)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--subtitle", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--diar-model", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--worker-dir", type=Path, default=Path("src-tauri/resources/asr"))
    parser.add_argument("--language", default="Korean")
    parser.add_argument("--window-seconds", type=float, default=20.0)
    args = parser.parse_args()

    import numpy as np
    import mlx.core as mx
    from mlx_qwen3_asr import Session

    sys.path.insert(0, str(args.worker_dir.resolve()))
    from asr_worker import sanitize_stream_text, speech_activity_ratio, transcribe_meeting_audio

    mx.set_cache_limit(512 * 1024 * 1024)
    audio, sample_rate = read_wav(args.audio)
    audio = np.asarray(audio, dtype=np.float32)
    events = caption_events(args.subtitle)
    session = Session(model=str(args.model))
    window_samples = max(1, int(args.window_seconds * sample_rate))
    total_windows = (len(audio) + window_samples - 1) // window_samples
    activity_ratios: list[float | None] = [None] * total_windows
    if args.diar_model:
        from mlx_audio.vad import load as load_diarization

        diarizer = load_diarization(str(args.diar_model))
        diar_state = diarizer.init_streaming_state()
        diar_segments: list[Any] = []
        diar_chunk_samples = 2 * sample_rate
        for offset in range(0, len(audio), diar_chunk_samples):
            result, diar_state = diarizer.feed(
                audio[offset:offset + diar_chunk_samples],
                diar_state,
                sample_rate=sample_rate,
                threshold=0.65,
                min_duration=0.64,
                merge_gap=0.24,
            )
            diar_segments.extend(list(getattr(result, "segments", []) or []))
        for index in range(total_windows):
            start = index * args.window_seconds
            end = min(len(audio) / sample_rate, start + args.window_seconds)
            activity_ratios[index] = speech_activity_ratio(diar_segments, start, end)
        print(f"measured speech activity for {total_windows} windows", flush=True)
    checkpoint_path = args.output.with_suffix(".partial.json")
    rows: list[dict[str, Any]] = []
    if checkpoint_path.exists():
        try:
            rows = list(json.loads(checkpoint_path.read_text("utf-8")).get("windows", []))
            print(f"resuming after {len(rows)} windows", flush=True)
        except Exception:
            rows = []
    started = time.perf_counter()

    for index, offset in enumerate(range(0, len(audio), window_samples)):
        if index < len(rows):
            continue
        end_offset = min(len(audio), offset + window_samples)
        start_seconds = offset / sample_rate
        end_seconds = end_offset / sample_rate
        reference = reference_for_window(events, start_seconds, end_seconds)
        before = time.perf_counter()
        text, detected_language = transcribe_meeting_audio(
            session,
            audio[offset:end_offset],
            sample_rate,
            speech_activity=activity_ratios[index],
        )
        text = sanitize_stream_text(text, detected_language)
        inference_seconds = time.perf_counter() - before
        reference_chars = character_units(reference)
        hypothesis_chars = character_units(text)
        reference_words = word_units(reference, args.language)
        hypothesis_words = word_units(text, args.language)
        char_edits = edit_distance(reference_chars, hypothesis_chars)
        word_edits = edit_distance(reference_words, hypothesis_words)
        rows.append({
            "index": index,
            "startSeconds": round(start_seconds, 3),
            "endSeconds": round(end_seconds, 3),
            "detectedLanguage": detected_language,
            "speechActivityRatio": (
                round(activity_ratios[index], 4)
                if activity_ratios[index] is not None
                else None
            ),
            "inferenceSeconds": round(inference_seconds, 4),
            "referenceCharacters": len(reference_chars),
            "hypothesisCharacters": len(hypothesis_chars),
            "characterEdits": char_edits,
            "cer": round(char_edits / max(1, len(reference_chars)), 4),
            "referenceWords": len(reference_words),
            "hypothesisWords": len(hypothesis_words),
            "wordEdits": word_edits,
            "wer": round(word_edits / max(1, len(reference_words)), 4),
            "reference": reference,
            "transcript": text,
        })
        if (index + 1) % 10 == 0 or index + 1 == total_windows:
            checkpoint_path.write_text(
                json.dumps({"windows": rows}, ensure_ascii=False),
                "utf-8",
            )
            print(f"{index + 1}/{total_windows} windows", flush=True)

    elapsed = time.perf_counter() - started
    inference_times = [row["inferenceSeconds"] for row in rows]
    reference_character_count = sum(row["referenceCharacters"] for row in rows)
    reference_word_count = sum(row["referenceWords"] for row in rows)
    continuous_reference_words = word_units(" ".join(row["reference"] for row in rows), args.language)
    continuous_hypothesis_words = word_units(" ".join(row["transcript"] for row in rows), args.language)
    continuous_word_edits = edit_distance(continuous_reference_words, continuous_hypothesis_words)
    alignment_group_windows = 20
    grouped_character_edits = 0
    for offset in range(0, len(rows), alignment_group_windows):
        group = rows[offset:offset + alignment_group_windows]
        grouped_character_edits += edit_distance(
            character_units(" ".join(row["reference"] for row in group)),
            character_units(" ".join(row["transcript"] for row in group)),
        )
    summary = {
        "audioSeconds": round(len(audio) / sample_rate, 3),
        "windowSeconds": args.window_seconds,
        "windowCount": len(rows),
        "referenceCharacters": reference_character_count,
        "referenceWords": reference_word_count,
        "cer": round(sum(row["characterEdits"] for row in rows) / max(1, reference_character_count), 4),
        "wer": round(sum(row["wordEdits"] for row in rows) / max(1, reference_word_count), 4),
        "continuousWer": round(continuous_word_edits / max(1, len(continuous_reference_words)), 4),
        "continuousWordEdits": continuous_word_edits,
        "groupedCer": round(grouped_character_edits / max(1, reference_character_count), 4),
        "alignmentGroupSeconds": args.window_seconds * alignment_group_windows,
        "meanWindowCer": round(statistics.mean(row["cer"] for row in rows), 4),
        "meanWindowWer": round(statistics.mean(row["wer"] for row in rows), 4),
        "inferenceP50Seconds": round(statistics.median(inference_times), 4),
        "inferenceP95Seconds": round(percentile(inference_times, 0.95), 4),
        "inferenceMaxSeconds": round(max(inference_times, default=0.0), 4),
        "wallSeconds": round(elapsed, 3),
        "realTimeFactor": round(elapsed / max(0.001, len(audio) / sample_rate), 4),
        "unexpectedLanguageWindows": sum(
            str(row["detectedLanguage"]).lower() not in {"korean", "ko", "kr", "english", "en"}
            for row in rows
        ),
        "emptyTranscriptWindows": sum(not row["transcript"] for row in rows),
    }
    payload = {"summary": summary, "windows": rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    checkpoint_path.unlink(missing_ok=True)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
