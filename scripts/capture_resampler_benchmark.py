#!/usr/bin/env python3
"""Measure Ulpaso's native capture preparation with podcast captions.

The regular podcast benchmark starts from an ffmpeg-created 16 kHz WAV and
therefore cannot detect regressions in the app's Rust capture path. This tool
starts from a native-rate 48 kHz WAV and compares the former unfiltered 3:1
decimation with the windowed-sinc anti-alias filter used by the app. Both
resampler paths also reproduce the production system-audio mixer gain and
limiter so the reported absolute ASR metrics match the PCM sent to the worker.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import sys
from datetime import date
from pathlib import Path
from typing import Any, Callable, Iterable

from podcast_asr_benchmark import (
    character_units,
    error_rate,
    parse_youtube_json3,
    read_wav,
    slice_audio_range,
    word_units,
)


CAPTURE_INPUT_RATE = 48_000
ASR_OUTPUT_RATE = 16_000
FILTER_TAPS = 255
CUTOFF_GUARD = 0.90


def capture_filter_coefficients(
    input_rate: int = CAPTURE_INPUT_RATE,
    output_rate: int = ASR_OUTPUT_RATE,
):
    """Return the same Blackman-windowed sinc coefficients as Rust."""
    import numpy as np

    cutoff = 0.5 * output_rate / input_rate * CUTOFF_GUARD
    center = (FILTER_TAPS - 1) / 2.0
    values: list[float] = []
    for index in range(FILTER_TAPS):
        offset = index - center
        argument = 2.0 * cutoff * offset
        sinc = (
            1.0
            if abs(argument) < sys.float_info.epsilon
            else math.sin(math.pi * argument) / (math.pi * argument)
        )
        window = (
            0.42
            - 0.5 * math.cos(2.0 * math.pi * index / (FILTER_TAPS - 1))
            + 0.08 * math.cos(4.0 * math.pi * index / (FILTER_TAPS - 1))
        )
        values.append(2.0 * cutoff * sinc * window)
    coefficients = np.asarray(values, dtype=np.float64)
    return (coefficients / coefficients.sum()).astype(np.float32)


def legacy_capture_resample(audio: Any):
    """Reproduce the former 48 -> 16 kHz unfiltered sample selection."""
    import numpy as np

    return np.asarray(audio, dtype=np.float32)[::3].copy()


def production_capture_resample(audio: Any):
    """Reproduce the production causal FIR and 3:1 output phase."""
    import numpy as np

    values = np.asarray(audio, dtype=np.float32)
    coefficients = capture_filter_coefficients()
    try:
        from scipy.signal import lfilter

        filtered = lfilter(
            coefficients,
            np.ones(1, dtype=np.float32),
            values,
        )
    except ImportError:
        # Unit tests run with the lightweight system Python. The bundled ASR
        # runtime has scipy and uses the faster path for real benchmarks.
        filtered = np.convolve(values, coefficients, mode="full")[: len(values)]
    # Rust emits after the third input sample when its phase first reaches
    # 48 kHz, hence index 2 rather than the legacy path's index 0.
    return np.asarray(filtered[2::3], dtype=np.float32)


def production_system_mix(audio: Any):
    """Reproduce Rust's current system-only result: tanh(0.65 * system)."""
    import numpy as np

    values = np.asarray(audio, dtype=np.float32)
    return np.tanh(values * np.float32(0.65)).astype(np.float32, copy=False)


def transparent_system_mix(audio: Any):
    """Candidate system-only path that preserves level while remaining bounded."""
    import numpy as np

    values = np.asarray(audio, dtype=np.float32)
    return np.clip(values, -1.0, 1.0).astype(np.float32, copy=False)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def benchmark_sample(
    session: Any,
    sample: dict[str, Any],
    assets_dir: Path,
    *,
    window_seconds: float,
    transcriber: Callable[[Any, Any, int, float], str],
) -> dict[str, Any]:
    import numpy as np

    audio_path = assets_dir / f"{sample['id']}.48k.wav"
    subtitle_path = assets_dir / sample["subtitle"]
    audio, sample_rate = read_wav(audio_path)
    if sample_rate != CAPTURE_INPUT_RATE:
        raise ValueError(
            f"{sample['id']} capture WAV must be {CAPTURE_INPUT_RATE} Hz, got {sample_rate}"
        )
    audio = slice_audio_range(
        audio,
        sample_rate,
        float(sample.get("startSeconds", 0)),
        float(sample["endSeconds"]),
    )
    audio = np.asarray(audio, dtype=np.float32)
    reference = parse_youtube_json3(
        subtitle_path,
        float(sample.get("startSeconds", 0)),
        float(sample["endSeconds"]),
    )
    reference_chars = character_units(reference)
    reference_words = word_units(reference, sample["language"])
    result: dict[str, Any] = {
        "id": sample["id"],
        "title": sample["title"],
        "language": sample["language"],
        "referenceQuality": sample["referenceQuality"],
        "audioSeconds": round(len(audio) / sample_rate, 3),
        "audioSha256": sha256(audio_path),
        "subtitleSha256": sha256(subtitle_path),
    }
    prepared_by_label = (
        (
            "legacy",
            production_system_mix(legacy_capture_resample(audio)),
        ),
        (
            "antiAliased",
            production_system_mix(production_capture_resample(audio)),
        ),
        (
            "transparentSystem",
            transparent_system_mix(production_capture_resample(audio)),
        ),
    )
    for label, prepared in prepared_by_label:
        text = transcriber(session, prepared, ASR_OUTPUT_RATE, window_seconds)
        result[f"{label}Cer"] = round(
            error_rate(reference_chars, character_units(text)),
            4,
        )
        result[f"{label}Wer"] = round(
            error_rate(reference_words, word_units(text, sample["language"])),
            4,
        )
    return result


def summarize(results: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = list(results)
    manual = [row for row in rows if row["referenceQuality"] == "manual"]
    trusted = manual or rows
    return {
        "sampleCount": len(rows),
        "manualReferenceCount": len(manual),
        "audioSeconds": round(sum(float(row["audioSeconds"]) for row in rows), 3),
        "legacyMeanCer": round(statistics.mean(row["legacyCer"] for row in trusted), 4),
        "legacyMeanWer": round(statistics.mean(row["legacyWer"] for row in trusted), 4),
        "antiAliasedMeanCer": round(
            statistics.mean(row["antiAliasedCer"] for row in trusted),
            4,
        ),
        "antiAliasedMeanWer": round(
            statistics.mean(row["antiAliasedWer"] for row in trusted),
            4,
        ),
        "transparentSystemMeanCer": round(
            statistics.mean(row["transparentSystemCer"] for row in trusted),
            4,
        ),
        "transparentSystemMeanWer": round(
            statistics.mean(row["transparentSystemWer"] for row in trusted),
            4,
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path("benchmarks/podcast_samples.json"))
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sample", action="append", default=[])
    parser.add_argument("--window-seconds", type=float, default=20.0)
    parser.add_argument("--worker-dir", type=Path, default=Path("src-tauri/resources/asr"))
    args = parser.parse_args()

    import mlx.core as mx
    from mlx_qwen3_asr import Session

    sys.path.insert(0, str(args.worker_dir.resolve()))
    from asr_artifacts import ASR_REPO, MODEL_REVISIONS
    from asr_worker import configure_streaming_join_rules, transcribe_audio_windowed

    samples = json.loads(args.manifest.read_text("utf-8"))
    if args.sample:
        selected = set(args.sample)
        samples = [sample for sample in samples if sample["id"] in selected]
    if not samples:
        raise SystemExit("no capture-resampler samples selected")

    configure_streaming_join_rules()
    mx.set_cache_limit(512 * 1024 * 1024)
    session = Session(model=str(args.model))
    transcriber = lambda current_session, audio, rate, seconds: transcribe_audio_windowed(
        current_session,
        audio,
        rate,
        max_window_sec=seconds,
    )
    results = []
    for sample in samples:
        print(f"benchmarking native capture · {sample['id']} · {sample['title']}", flush=True)
        row = benchmark_sample(
            session,
            sample,
            args.assets_dir,
            window_seconds=args.window_seconds,
            transcriber=transcriber,
        )
        results.append(row)
        print(
            f"  legacy WER={row['legacyWer']:.4f} "
            f"anti-aliased WER={row['antiAliasedWer']:.4f} "
            f"transparent-system WER={row['transparentSystemWer']:.4f}",
            flush=True,
        )

    summary = summarize(results)
    payload = {
        "measuredAt": date.today().isoformat(),
        "model": ASR_REPO,
        "modelRevision": MODEL_REVISIONS[ASR_REPO],
        "inputSampleRate": CAPTURE_INPUT_RATE,
        "outputSampleRate": ASR_OUTPUT_RATE,
        "filterTaps": FILTER_TAPS,
        "cutoffGuard": CUTOFF_GUARD,
        "windowSeconds": args.window_seconds,
        **summary,
        "samples": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
