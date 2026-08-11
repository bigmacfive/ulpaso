#!/usr/bin/env python3
"""Validate committed benchmark manifests and aggregate results without media."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


REFERENCE_QUALITIES = {"manual", "automatic-original"}


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"{path}: invalid JSON: {error}") from error


def validate_samples(path: Path) -> list[dict[str, Any]]:
    samples = read_json(path)
    if not isinstance(samples, list) or not samples:
        raise ValueError(f"{path}: expected a non-empty array")
    seen: set[str] = set()
    for index, sample in enumerate(samples):
        label = f"{path}[{index}]"
        if not isinstance(sample, dict):
            raise ValueError(f"{label}: expected an object")
        sample_id = sample.get("id")
        if not isinstance(sample_id, str) or not sample_id:
            raise ValueError(f"{label}: missing id")
        if sample_id in seen:
            raise ValueError(f"{label}: duplicate id {sample_id}")
        seen.add(sample_id)
        parsed = urlparse(str(sample.get("url", "")))
        query_id = parse_qs(parsed.query).get("v", [None])[0]
        if parsed.scheme != "https" or parsed.netloc not in {"youtube.com", "www.youtube.com"} or query_id != sample_id:
            raise ValueError(f"{label}: URL does not identify {sample_id}")
        if sample.get("referenceQuality") not in REFERENCE_QUALITIES:
            raise ValueError(f"{label}: unsupported referenceQuality")
        start = sample.get("startSeconds")
        end = sample.get("endSeconds")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or start < 0 or end <= start:
            raise ValueError(f"{label}: invalid time range")
        subtitle = sample.get("subtitle")
        if not isinstance(subtitle, str) or not subtitle.startswith(f"{sample_id}.") or not subtitle.endswith(".json3"):
            raise ValueError(f"{label}: subtitle must be an id-prefixed JSON3 filename")
    return samples


def metric(value: Any, label: str) -> None:
    if not isinstance(value, (int, float)) or not 0 <= value <= 1:
        raise ValueError(f"{label}: expected a metric between 0 and 1")


def validate_podcast_results(path: Path, samples: list[dict[str, Any]]) -> None:
    result = read_json(path)
    rows = result.get("samples") if isinstance(result, dict) else None
    if not isinstance(rows, list):
        raise ValueError(f"{path}: samples must be an array")
    expected_ids = [sample["id"] for sample in samples]
    actual_ids = [row.get("id") for row in rows if isinstance(row, dict)]
    if actual_ids != expected_ids:
        raise ValueError(f"{path}: result ids do not match podcast_samples.json order")
    if result.get("sampleCount") != len(samples):
        raise ValueError(f"{path}: sampleCount is stale")
    manual_count = sum(sample["referenceQuality"] == "manual" for sample in samples)
    if result.get("manualReferenceCount") != manual_count:
        raise ValueError(f"{path}: manualReferenceCount is stale")
    for key in ("manualLiveMeanCer", "manualLiveMeanWer", "manualRollingMeanCer", "manualRollingMeanWer"):
        metric(result.get(key), f"{path}:{key}")
    for row in rows:
        for key in ("liveCer", "liveWer", "rollingCer", "rollingWer"):
            metric(row.get(key), f"{path}:{row.get('id')}:{key}")


def validate_full_video_results(path: Path, samples: list[dict[str, Any]]) -> None:
    result = read_json(path)
    if not isinstance(result, dict) or result.get("id") not in {sample["id"] for sample in samples}:
        raise ValueError(f"{path}: result id is not in full_video_samples.json")
    for section in ("baseline", "improved"):
        values = result.get(section)
        if not isinstance(values, dict):
            raise ValueError(f"{path}:{section}: expected an object")
        for key in ("cer", "wer", "continuousWer", "groupedCer"):
            metric(values.get(key), f"{path}:{section}:{key}")
    replay = result.get("productionWorkerReplay")
    if not isinstance(replay, dict):
        raise ValueError(f"{path}: missing productionWorkerReplay")
    metric(replay.get("continuousWer"), f"{path}:productionWorkerReplay:continuousWer")
    if replay.get("captionedSpeechAfterLastTranscript") is not False:
        raise ValueError(f"{path}: production replay does not cover the captioned ending")


def validate_directory(directory: Path) -> None:
    podcasts = validate_samples(directory / "podcast_samples.json")
    full_videos = validate_samples(directory / "full_video_samples.json")
    validate_podcast_results(directory / "latest_results.json", podcasts)
    validate_full_video_results(directory / "full_video_latest_results.json", full_videos)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path, nargs="?", default=Path("benchmarks"))
    args = parser.parse_args()
    validate_directory(args.directory)
    print(f"Validated benchmark metadata in {args.directory}")


if __name__ == "__main__":
    main()
