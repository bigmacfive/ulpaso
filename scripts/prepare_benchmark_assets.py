#!/usr/bin/env python3
"""Fetch temporary benchmark WAV/caption assets with the user's yt-dlp."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


def commands_for_sample(sample: dict[str, Any], assets_dir: Path) -> list[list[str]]:
    sample_id = str(sample["id"])
    subtitle_name = str(sample["subtitle"])
    language = subtitle_name[len(sample_id) + 1 : -len(".json3")]
    output = str(assets_dir / f"{sample_id}.%(ext)s")
    common = ["yt-dlp", "--no-playlist", "--no-progress"]
    return [
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
        common + [
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
        ],
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path("benchmarks/podcast_samples.json"))
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--sample", action="append", default=[])
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
        for command in commands_for_sample(sample, args.assets_dir):
            subprocess.run(command, check=True)
        expected = [
            args.assets_dir / f"{sample['id']}.wav",
            args.assets_dir / sample["subtitle"],
        ]
        missing = [str(path) for path in expected if not path.exists()]
        if missing:
            raise SystemExit(f"yt-dlp did not create expected assets: {', '.join(missing)}")


if __name__ == "__main__":
    main()
