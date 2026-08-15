#!/usr/bin/env python3
"""Fetch temporary benchmark WAV/caption assets with the user's yt-dlp."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


def commands_for_sample(
    sample: dict[str, Any],
    assets_dir: Path,
    *,
    capture_resampler: bool = False,
) -> list[list[str]]:
    sample_id = str(sample["id"])
    subtitle_name = str(sample["subtitle"])
    language = subtitle_name[len(sample_id) + 1 : -len(".json3")]
    output = str(assets_dir / f"{sample_id}.%(ext)s")
    common = ["yt-dlp", "--no-playlist", "--no-progress"]
    commands = [
        common + [
            "--extract-audio",
            "--audio-format",
            "wav",
            "--postprocessor-args",
            "ffmpeg:-ac 1 -ar 16000",
            "--output",
            output,
            str(sample["url"]),
        ],
    ]
    if capture_resampler:
        commands.append(common + [
            "--extract-audio",
            "--audio-format",
            "wav",
            "--postprocessor-args",
            "ffmpeg:-ac 1 -ar 48000",
            "--output",
            str(assets_dir / f"{sample_id}.48k.%(ext)s"),
            str(sample["url"]),
        ])
    commands.append(common + [
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs",
            language,
            "--sub-format",
            "json3",
            "--output",
            output,
            str(sample["url"]),
        ])
    return commands


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path("benchmarks/podcast_samples.json"))
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--sample", action="append", default=[])
    parser.add_argument("--capture-resampler", action="store_true")
    args = parser.parse_args()
    if shutil.which("yt-dlp") is None or shutil.which("ffmpeg") is None:
        raise SystemExit("yt-dlp and ffmpeg must be installed and available on PATH")

    samples = json.loads(args.manifest.read_text("utf-8"))
    if args.sample:
        selected = set(args.sample)
        samples = [sample for sample in samples if sample["id"] in selected]
    if not samples:
        raise SystemExit("no benchmark samples selected")
    args.assets_dir.mkdir(parents=True, exist_ok=True)

    for sample in samples:
        print(f"preparing {sample['id']} · {sample['title']}", flush=True)
        for command in commands_for_sample(
            sample,
            args.assets_dir,
            capture_resampler=args.capture_resampler,
        ):
            subprocess.run(command, check=True)
        expected = [
            args.assets_dir / f"{sample['id']}.wav",
            args.assets_dir / sample["subtitle"],
        ]
        if args.capture_resampler:
            expected.append(args.assets_dir / f"{sample['id']}.48k.wav")
        missing = [str(path) for path in expected if not path.exists()]
        if missing:
            raise SystemExit(f"yt-dlp did not create expected assets: {', '.join(missing)}")


if __name__ == "__main__":
    main()
