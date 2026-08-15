#!/usr/bin/env python3
"""Replay a WAV through Ulpaso's production ASR worker protocol.

This is an integration verifier, not an alternate transcription path. It
launches the bundled worker, sends the same two-second float PCM frames as the
Tauri backend, and stores the worker's final event for inspection.
"""

from __future__ import annotations

import argparse
import json
import queue
import struct
import subprocess
import sys
import threading
import time
import wave
from pathlib import Path
from typing import BinaryIO, Any

from full_video_asr_benchmark import caption_events
from podcast_asr_benchmark import edit_distance, word_units


def write_frame(target: BinaryIO, kind: int, payload: bytes = b"") -> None:
    target.write(bytes((kind,)))
    target.write(struct.pack("<I", len(payload)))
    if payload:
        target.write(payload)
    target.flush()


def pcm_frames(path: Path, frame_seconds: float = 2.0):
    import numpy as np

    with wave.open(str(path), "rb") as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise RuntimeError("입력 WAV는 16-bit mono PCM이어야 합니다")
        sample_rate = source.getframerate()
        frame_samples = max(1, int(sample_rate * frame_seconds))
        while True:
            raw = source.readframes(frame_samples)
            if not raw:
                return
            pcm = np.frombuffer(raw, dtype="<i2").astype("<f4") / 32768.0
            yield pcm.tobytes(), len(pcm) / sample_rate


def read_events(source: BinaryIO, output: queue.Queue[dict[str, Any]]) -> None:
    for raw_line in iter(source.readline, b""):
        try:
            output.put(json.loads(raw_line.decode("utf-8")))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue


def wait_for_event(
    events: queue.Queue[dict[str, Any]],
    accepted: set[str],
    timeout: float,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f"worker event timeout: {sorted(accepted)}")
        event = events.get(timeout=remaining)
        event_type = str(event.get("type", ""))
        if event_type == "error":
            raise RuntimeError(str(event.get("message") or event))
        if event_type in accepted:
            return event


def markdown_from_final(title: str, event: dict[str, Any]) -> str:
    parts = [f"## {title}"]
    segments = list(event.get("segments") or [])
    if not segments:
        text = str(event.get("text", "") or "").strip()
        return "\n\n".join([*parts, text]).strip() + "\n"
    for segment in segments:
        text = str(segment.get("text", "") or "").strip()
        if not text:
            continue
        speaker = segment.get("speaker")
        if speaker is not None:
            parts.append(f"**화자 {speaker}**")
        parts.append(text)
    return "\n\n".join(parts).strip() + "\n"


def score_final_event(
    event: dict[str, Any],
    subtitle_path: Path,
    language: str,
) -> dict[str, Any]:
    """Score both the worker's canonical text and what the editor will save."""
    captions = caption_events(subtitle_path)
    reference_words = word_units(
        " ".join(str(caption["text"]) for caption in captions),
        language,
    )
    final_text = str(event.get("text", "") or "").strip()
    segments = list(event.get("segments") or [])
    document_text = " ".join(
        str(segment.get("text", "") or "").strip()
        for segment in segments
        if str(segment.get("text", "") or "").strip()
    ).strip() or final_text

    def wer(text: str) -> tuple[float, int, int]:
        hypothesis_words = word_units(text, language)
        edits = edit_distance(reference_words, hypothesis_words)
        return (
            round(edits / max(1, len(reference_words)), 4),
            edits,
            len(hypothesis_words),
        )

    final_wer, final_edits, final_words = wer(final_text)
    document_wer, document_edits, document_words = wer(document_text)
    transcript_ends = [
        float(segment["end"])
        for segment in segments
        if isinstance(segment, dict) and isinstance(segment.get("end"), (int, float))
    ]
    last_transcript_end = max(transcript_ends, default=None)
    captioned_after_end = bool(captions) and (
        last_transcript_end is None
        or any(float(caption["midpoint"]) > last_transcript_end for caption in captions)
    )
    normalized_final = " ".join(final_text.split())
    normalized_document = " ".join(document_text.split())
    return {
        "referenceWords": len(reference_words),
        "continuousWer": final_wer,
        "continuousWordEdits": final_edits,
        "textWords": final_words,
        "documentContinuousWer": document_wer,
        "documentWordEdits": document_edits,
        "documentWords": document_words,
        "documentMatchesFinalText": normalized_document == normalized_final,
        "lastTranscriptEndSeconds": (
            round(last_transcript_end, 3) if last_transcript_end is not None else None
        ),
        "captionedSpeechAfterLastTranscript": captioned_after_end,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", type=Path, required=True)
    parser.add_argument("--worker", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--markdown", type=Path)
    parser.add_argument("--title", default="미팅 노트 · 전체 전사 검증")
    parser.add_argument("--subtitle", type=Path)
    parser.add_argument("--language", default="Korean")
    args = parser.parse_args()

    process = subprocess.Popen(
        [
            str(args.python),
            str(args.worker),
            "--model-dir",
            str(args.model_dir),
            "--audio-path",
            str(args.audio),
            "--session-id",
            "full-video-replay",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdin is not None
    assert process.stdout is not None
    events: queue.Queue[dict[str, Any]] = queue.Queue()
    reader = threading.Thread(target=read_events, args=(process.stdout, events), daemon=True)
    reader.start()
    try:
        wait_for_event(events, {"ready"}, timeout=180.0)
        print("worker ready", flush=True)
        sent_seconds = 0.0
        next_progress = 300.0
        for payload, duration in pcm_frames(args.audio):
            write_frame(process.stdin, 1, payload)
            sent_seconds += duration
            if sent_seconds >= next_progress:
                print(f"sent {sent_seconds / 60.0:.1f} minutes", flush=True)
                next_progress += 300.0
        write_frame(process.stdin, 2)
        final_event = wait_for_event(events, {"final"}, timeout=300.0)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(final_event, ensure_ascii=False, indent=2), "utf-8")
        if args.markdown:
            args.markdown.parent.mkdir(parents=True, exist_ok=True)
            args.markdown.write_text(markdown_from_final(args.title, final_event), "utf-8")
        score = (
            score_final_event(final_event, args.subtitle, args.language)
            if args.subtitle is not None
            else {}
        )
        print(
            json.dumps(
                {
                    "audioSeconds": round(sent_seconds, 3),
                    "textCharacters": len(str(final_event.get("text", ""))),
                    "segments": len(list(final_event.get("segments") or [])),
                    **score,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
    finally:
        try:
            process.stdin.close()
        except (BrokenPipeError, OSError):
            pass
        try:
            return_code = process.wait(timeout=10.0)
        except subprocess.TimeoutExpired:
            process.terminate()
            return_code = process.wait(timeout=10.0)
        if return_code != 0:
            stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
            raise RuntimeError(f"worker exited with {return_code}: {stderr[-2000:]}")


if __name__ == "__main__":
    main()
