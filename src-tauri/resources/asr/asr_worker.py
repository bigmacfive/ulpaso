#!/usr/bin/env python3
"""Persistent local Qwen3-ASR + Sortformer worker for Ulpaso.

stdin protocol: one-byte kind + little-endian u32 payload length + payload.
  1: float32 little-endian mono 16 kHz PCM
  2: finish and emit a final transcript
  3: cancel
stdout protocol: one compact JSON object per line.
"""

from __future__ import annotations

import argparse
import os
import re
import time
import unicodedata
import wave
from pathlib import Path
from typing import Any

from asr_artifacts import (
    ASR_REPO,
    DIAR_REPO,
    MODEL_REVISIONS,
    DownloadReporter,
    prepare_model,
    verify_model,
)
from asr_protocol import emit, read_frame

# Qwen3-ASR may echo free-form system context into short/noisy turn output.
# Keep the main decode unbiased and use the targeted Korean retry below only
# when auto language detection leaves the expected Korean/English set.
MEETING_CONTEXT = ""
ROLLING_REFINE_SECONDS = 20.0
REFINE_BUFFER_SECONDS = 24.0
REFINE_MIN_SECONDS = 16.0
REFINE_MAX_SECONDS = 22.0
REFINE_OVERLAP_SECONDS = 0.35
LONG_MEETING_SECONDS = 30.0 * 60.0
# Validated against 2-, 3-, and 4-speaker VoxConverse reference clips. 0.65
# erased quieter speakers in the 3-speaker sample; 0.40 preserved all expected
# speakers while keeping false-positive speech below 1.3% across the fixtures.
DIARIZATION_THRESHOLD = 0.40
EXPECTED_MEETING_LANGUAGES = {"", "unknown", "korean", "ko", "kr", "english", "en"}
KOREAN_COLLOQUIAL_NORMALIZATIONS = {
    "근데": "그런데",
    "보면은": "보면",
    "하면은": "하면",
    "있으면은": "있으면",
    "없으면은": "없으면",
    "그러면은": "그러면",
    "아니면은": "아니면",
    "거면은": "거면",
    "왜냐면": "왜냐하면",
}


def configure_streaming_join_rules(aliases: set[str] | None = None) -> None:
    """Use word boundaries when joining Korean streaming chunks.

    mlx-qwen3-asr 0.3.5 groups Korean with unspaced Chinese/Japanese text,
    which glues every independently decoded chunk together. Korean orthography
    is space-delimited, so it must use the Latin-style word overlap path.
    """
    if aliases is None:
        import mlx_qwen3_asr.streaming as streaming

        aliases = streaming._CJK_LANG_ALIASES
    for alias in ("korean", "ko", "kr"):
        aliases.discard(alias)


def sanitize_stream_text(text: str, language: str | None) -> str:
    """Remove short foreign-script hallucinations from Korean/English output."""
    value = str(text or "")
    unexpected_run = 0
    longest_unexpected_run = 0
    for character in value:
        if not unicodedata.category(character).startswith("L"):
            unexpected_run = 0
            continue
        codepoint = ord(character)
        is_latin = 0x0041 <= codepoint <= 0x007A or 0x00C0 <= codepoint <= 0x024F
        is_hangul = (
            0x1100 <= codepoint <= 0x11FF
            or 0x3130 <= codepoint <= 0x318F
            or 0xAC00 <= codepoint <= 0xD7AF
        )
        unexpected_run = 0 if is_latin or is_hangul else unexpected_run + 1
        longest_unexpected_run = max(longest_unexpected_run, unexpected_run)
    if not contains_unexpected_script(value) and longest_unexpected_run < 3:
        return value.strip()
    normalized_language = str(language or "").strip().lower()
    if normalized_language not in {"", "unknown", "korean", "ko", "kr", "english", "en"}:
        return value.strip()

    cleaned: list[str] = []
    for character in value:
        if not unicodedata.category(character).startswith("L"):
            cleaned.append(character)
            continue
        codepoint = ord(character)
        is_latin = 0x0041 <= codepoint <= 0x007A or 0x00C0 <= codepoint <= 0x024F
        is_hangul = (
            0x1100 <= codepoint <= 0x11FF
            or 0x3130 <= codepoint <= 0x318F
            or 0xAC00 <= codepoint <= 0xD7AF
        )
        cleaned.append(character if is_latin or is_hangul else " ")
    result = re.sub(r"\s+", " ", "".join(cleaned)).strip()
    return re.sub(r"\s+([.,!?…])", r"\1", result)


def polish_meeting_transcript(text: str, language: str | None) -> str:
    """Conservatively tidy finalized Korean blocks without rewriting meaning.

    The two-second preview remains verbatim and responsive. Only the accuracy
    pass removes isolated hesitation sounds and normalizes a small set of
    colloquial forms that repeatedly differed from human-edited meeting notes.
    """
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    if str(language or "").strip().lower() not in {"korean", "ko", "kr"}:
        return value
    value = re.sub(
        r"(?<!\S)(?:어+|음+|으+|아+)(?:[,.!?…]+)?(?=\s|$)\s*",
        "",
        value,
    )
    for source, target in KOREAN_COLLOQUIAL_NORMALIZATIONS.items():
        value = re.sub(
            rf"(?<!\S){re.escape(source)}(?=[,.!?…]?\s|[,.!?…]?$)",
            target,
            value,
        )
    value = re.sub(r"\s+([,.!?…])", r"\1", re.sub(r"\s+", " ", value)).strip()
    return value


def speech_activity_ratio(raw_segments: list[Any], start: float, end: float) -> float:
    """Return unioned speech coverage so overlapping speakers count once."""
    duration = max(0.0, end - start)
    if duration <= 0:
        return 0.0
    intervals: list[tuple[float, float]] = []
    for segment in raw_segments:
        segment_start = max(start, float(getattr(segment, "start", 0.0)))
        segment_end = min(end, float(getattr(segment, "end", 0.0)))
        if segment_end > segment_start:
            intervals.append((segment_start, segment_end))
    intervals.sort()
    covered = 0.0
    current_start: float | None = None
    current_end = 0.0
    for interval_start, interval_end in intervals:
        if current_start is None:
            current_start, current_end = interval_start, interval_end
        elif interval_start <= current_end:
            current_end = max(current_end, interval_end)
        else:
            covered += current_end - current_start
            current_start, current_end = interval_start, interval_end
    if current_start is not None:
        covered += current_end - current_start
    return min(1.0, covered / duration)


def should_suppress_low_speech_hallucination(
    language: str | None,
    activity_ratio: float | None,
) -> bool:
    """Reject music/noise guesses only when both independent signals agree."""
    if activity_ratio is None or activity_ratio >= 0.22:
        return False
    return str(language or "").strip().lower() not in EXPECTED_MEETING_LANGUAGES


def normalize_speaker(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value)
    digits = "".join(character for character in text if character.isdigit())
    if not digits:
        return None
    return min(4, int(digits) + 1)


def contains_unexpected_script(text: str) -> bool:
    letter_count = 0
    unexpected_count = 0
    for character in text:
        if not unicodedata.category(character).startswith("L"):
            continue
        letter_count += 1
        codepoint = ord(character)
        is_latin = (
            0x0041 <= codepoint <= 0x007A
            or 0x00C0 <= codepoint <= 0x024F
        )
        is_hangul = (
            0x1100 <= codepoint <= 0x11FF
            or 0x3130 <= codepoint <= 0x318F
            or 0xAC00 <= codepoint <= 0xD7AF
        )
        if not is_latin and not is_hangul:
            unexpected_count += 1
    return unexpected_count >= 3 and unexpected_count / max(1, letter_count) >= 0.08


def needs_korean_retry(text: str, language: str | None) -> bool:
    return (
        contains_unexpected_script(text)
        or has_excessive_repetition(text)
    )


def retry_language(text: str, language: str | None) -> str:
    """Choose the closest supported meeting language for a bad auto decode."""
    normalized = str(language or "").strip().lower()
    if normalized in {"english", "en"}:
        return "English"
    if normalized in {"korean", "ko", "kr"}:
        return "Korean"
    hangul = sum(1 for character in text if 0xAC00 <= ord(character) <= 0xD7AF)
    latin = sum(
        1
        for character in text
        if 0x0041 <= ord(character) <= 0x007A or 0x00C0 <= ord(character) <= 0x024F
    )
    return "English" if latin > hangul and latin >= 3 else "Korean"


def has_excessive_repetition(text: str) -> bool:
    tokens = [token.strip(".,!?·:;()[]{}\"'").lower() for token in text.split()]
    tokens = [token for token in tokens if token]
    if len(tokens) < 6:
        return False
    for width in range(1, min(5, len(tokens) // 3) + 1):
        counts: dict[tuple[str, ...], int] = {}
        for index in range(len(tokens) - width + 1):
            phrase = tuple(tokens[index:index + width])
            counts[phrase] = counts.get(phrase, 0) + 1
        repetitions = max(counts.values(), default=0)
        if repetitions >= 3 and repetitions * width / len(tokens) >= 0.42:
            return True
    return False


def transcribe_meeting_audio(
    session: Any,
    audio: Any,
    sample_rate: int,
    *,
    speech_activity: float | None = None,
) -> tuple[str, str]:
    if len(audio) < max(1, int(sample_rate * 0.25)):
        return "", ""
    result = session.transcribe(
        (audio, sample_rate),
        context=MEETING_CONTEXT,
    )
    text = str(getattr(result, "text", "") or "").strip()
    language = str(getattr(result, "language", "") or "")
    if should_suppress_low_speech_hallucination(language, speech_activity):
        return "", language
    if needs_korean_retry(text, language):
        retry_as = retry_language(text, language)
        retry = session.transcribe(
            (audio, sample_rate),
            context=MEETING_CONTEXT,
            language=retry_as,
        )
        retry_text = str(getattr(retry, "text", "") or "").strip()
        if (
            retry_text
            and not contains_unexpected_script(retry_text)
            and not has_excessive_repetition(retry_text)
        ):
            return polish_meeting_transcript(retry_text, retry_as), retry_as
        if contains_unexpected_script(text) or has_excessive_repetition(text):
            return "", language
    return polish_meeting_transcript(text, language), language


def transcribe_audio_windowed(
    session: Any,
    audio: Any,
    sample_rate: int,
    max_window_sec: float = 30.0,
) -> str:
    window_samples = max(1, int(sample_rate * max_window_sec))
    texts: list[str] = []
    for start in range(0, len(audio), window_samples):
        window = audio[start:start + window_samples]
        if len(window) == 0:
            continue
        text, _ = transcribe_meeting_audio(session, window, sample_rate)
        if text:
            texts.append(text)
    return " ".join(texts).strip()


def join_transcript(*parts: str) -> str:
    return " ".join(part.strip() for part in parts if part and part.strip()).strip()


def merge_transcript_text(prefix: str, suffix: str, max_overlap_words: int = 12) -> str:
    """Join overlapping ASR windows without repeating their shared words."""
    left = str(prefix or "").strip()
    right = str(suffix or "").strip()
    if not left:
        return right
    if not right:
        return left
    left_words = left.split()
    right_words = right.split()

    def key(word: str) -> str:
        return re.sub(r"[^\w]+", "", word, flags=re.UNICODE).lower()

    limit = min(max_overlap_words, len(left_words), len(right_words))
    overlap = 0
    for width in range(limit, 0, -1):
        if [key(word) for word in left_words[-width:]] == [key(word) for word in right_words[:width]]:
            overlap = width
            break
    return join_transcript(left, " ".join(right_words[overlap:]))


def choose_silence_boundary(
    audio: Any,
    sample_rate: int,
    target_sec: float = ROLLING_REFINE_SECONDS,
    min_sec: float = REFINE_MIN_SECONDS,
    max_sec: float = REFINE_MAX_SECONDS,
) -> int:
    """Pick a quiet boundary near the target instead of cutting a syllable."""
    import numpy as np

    values = np.asarray(audio, dtype=np.float32)
    minimum = min(len(values), max(1, int(min_sec * sample_rate)))
    maximum = min(len(values), max(minimum, int(max_sec * sample_rate)))
    if maximum <= minimum:
        return maximum
    frame = max(1, int(0.24 * sample_rate))
    stride = max(1, int(0.08 * sample_rate))
    target = min(maximum, max(minimum, int(target_sec * sample_rate)))
    best_boundary = target
    best_score = float("inf")
    for center in range(minimum, maximum + 1, stride):
        start = max(0, center - frame // 2)
        end = min(len(values), start + frame)
        if end <= start:
            continue
        rms = float(np.sqrt(np.mean(np.square(values[start:end], dtype=np.float64))))
        distance_seconds = abs(center - target) / float(sample_rate)
        # A 6 dB quieter valley may move the boundary roughly two seconds.
        score = float(np.log10(rms + 1e-5)) + distance_seconds * 0.075
        if score < best_score:
            best_score = score
            best_boundary = center
    return max(minimum, min(maximum, best_boundary))


def transcribe_audio_adaptive(
    session: Any,
    audio: Any,
    sample_rate: int,
    buffer_sec: float = REFINE_BUFFER_SECONDS,
    overlap_sec: float = REFINE_OVERLAP_SECONDS,
) -> str:
    """Transcribe at quiet boundaries with a small context overlap."""
    import numpy as np

    values = np.asarray(audio, dtype=np.float32)
    buffer_samples = max(1, int(buffer_sec * sample_rate))
    overlap_samples = max(0, int(overlap_sec * sample_rate))
    cursor = 0
    result = ""
    while cursor < len(values):
        remaining = len(values) - cursor
        if remaining <= buffer_samples:
            boundary = remaining
        else:
            boundary = choose_silence_boundary(values[cursor:cursor + buffer_samples], sample_rate)
        start = max(0, cursor - (overlap_samples if cursor else 0))
        end = min(len(values), cursor + boundary + (overlap_samples if cursor + boundary < len(values) else 0))
        text, _ = transcribe_meeting_audio(session, values[start:end], sample_rate)
        result = merge_transcript_text(result, text)
        cursor += max(1, boundary)
    return result


def choose_live_speaker(result: Any) -> int | None:
    try:
        import numpy as np

        probabilities = np.asarray(getattr(result, "speaker_probs", None))
        if probabilities.ndim == 2 and probabilities.shape[0] > 0:
            means = probabilities.mean(axis=0)
            order = np.argsort(means)[::-1]
            top = int(order[0])
            runner_up = float(means[order[1]]) if len(order) > 1 else 0.0
            active_duration = float(np.count_nonzero(probabilities[:, top] >= 0.65)) * 0.08
            if float(means[top]) >= 0.68 and float(means[top]) - runner_up >= 0.12 and active_duration >= 0.64:
                return top + 1
    except Exception:
        pass

    segments = list(getattr(result, "segments", []) or [])
    if not segments:
        return None
    durations: dict[int, float] = {}
    for segment in segments:
        speaker = normalize_speaker(getattr(segment, "speaker", None))
        if speaker is None:
            continue
        duration = max(0.0, float(getattr(segment, "end", 0.0)) - float(getattr(segment, "start", 0.0)))
        durations[speaker] = durations.get(speaker, 0.0) + duration
    if not durations:
        return None
    speaker, duration = max(durations.items(), key=lambda item: item[1])
    return speaker if duration >= 0.8 else None


def mean_speaker_probability(
    speaker_probs: Any,
    speaker_index: int,
    start: float,
    end: float,
    duration: float,
) -> float | None:
    try:
        frame_count = len(speaker_probs)
        if frame_count == 0 or duration <= 0:
            return None
        first = max(0, min(frame_count - 1, int(start / duration * frame_count)))
        last = max(first + 1, min(frame_count, int(end / duration * frame_count + 0.999)))
        values = [float(speaker_probs[index][speaker_index]) for index in range(first, last)]
        return sum(values) / len(values) if values else None
    except Exception:
        return None


def merge_turns(
    raw_segments: list[Any],
    duration: float,
    speaker_probs: Any = None,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for raw in raw_segments:
        speaker = normalize_speaker(getattr(raw, "speaker", None))
        start = max(0.0, float(getattr(raw, "start", 0.0)))
        end = min(duration, float(getattr(raw, "end", 0.0)))
        if speaker is None or end - start < 0.7:
            continue
        candidates.append({
            "speaker": speaker,
            "start": start,
            "end": end,
            "original_duration": end - start,
        })
    candidates.sort(key=lambda turn: (turn["start"], turn["end"], turn["speaker"]))

    turns: list[dict[str, Any]] = []
    for candidate in candidates:
        speaker = candidate["speaker"]
        start = candidate["start"]
        end = candidate["end"]
        if turns and turns[-1]["speaker"] == speaker and start - turns[-1]["end"] <= 0.8:
            turns[-1]["end"] = max(turns[-1]["end"], end)
            turns[-1]["original_duration"] += candidate["original_duration"]
            continue
        if turns and start < turns[-1]["end"]:
            previous = turns[-1]
            overlap_end = min(previous["end"], end)
            previous_score = mean_speaker_probability(
                speaker_probs,
                previous["speaker"] - 1,
                start,
                overlap_end,
                duration,
            )
            current_score = mean_speaker_probability(
                speaker_probs,
                speaker - 1,
                start,
                overlap_end,
                duration,
            )
            current_wins = (
                current_score > previous_score
                if previous_score is not None and current_score is not None
                else candidate["original_duration"] > previous["original_duration"]
            )
            if current_wins:
                previous["end"] = start
                if previous["end"] - previous["start"] < 0.7:
                    turns.pop()
            else:
                start = previous["end"]
        if end - start >= 0.7:
            turns.append({
                "speaker": speaker,
                "start": start,
                "end": end,
                "original_duration": candidate["original_duration"],
            })

    # Avoid hundreds of tiny inference calls in noisy recordings.
    compact: list[dict[str, Any]] = []
    for turn in turns:
        if compact and turn["end"] - turn["start"] < 1.0:
            compact[-1]["end"] = max(compact[-1]["end"], turn["end"])
        else:
            compact.append(turn)

    if not compact:
        return compact
    totals: dict[int, float] = {}
    for turn in compact:
        totals[turn["speaker"]] = totals.get(turn["speaker"], 0.0) + turn["end"] - turn["start"]
    dominant = max(totals, key=totals.get)
    minimum_total = max(1.5, duration * 0.025)
    kept = {speaker for speaker, total in totals.items() if total >= minimum_total}
    kept.add(dominant)
    for index, turn in enumerate(compact):
        if turn["speaker"] in kept:
            continue
        previous = compact[index - 1]["speaker"] if index > 0 and compact[index - 1]["speaker"] in kept else None
        following = (
            compact[index + 1]["speaker"]
            if index + 1 < len(compact) and compact[index + 1]["speaker"] in kept
            else None
        )
        turn["speaker"] = previous or following or dominant

    merged: list[dict[str, Any]] = []
    for turn in compact:
        if merged and merged[-1]["speaker"] == turn["speaker"] and turn["start"] - merged[-1]["end"] <= 0.8:
            merged[-1]["end"] = max(merged[-1]["end"], turn["end"])
        else:
            merged.append(turn)
    return [
        {"speaker": turn["speaker"], "start": turn["start"], "end": turn["end"]}
        for turn in merged
    ]


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as source:
        return source.getnframes() / float(max(1, source.getframerate()))


def dominant_speaker_for_range(
    raw_segments: list[Any],
    start: float,
    end: float,
) -> int | None:
    durations: dict[int, float] = {}
    for segment in raw_segments:
        speaker = normalize_speaker(getattr(segment, "speaker", None))
        if speaker is None:
            continue
        overlap = max(
            0.0,
            min(end, float(getattr(segment, "end", 0.0)))
            - max(start, float(getattr(segment, "start", 0.0))),
        )
        if overlap > 0:
            durations[speaker] = durations.get(speaker, 0.0) + overlap
    return max(durations, key=durations.get) if durations else None


def build_rolling_speaker_segments(
    refined_blocks: list[dict[str, Any]],
    raw_segments: list[Any],
    duration: float,
) -> list[dict[str, Any]]:
    """Build a bounded-memory long-meeting result from live model output."""
    prepared: list[dict[str, Any]] = []
    previous_speaker: int | None = None
    for block in refined_blocks:
        text = str(block.get("text", "") or "").strip()
        if not text:
            continue
        start = max(0.0, float(block.get("start", 0.0)))
        end = min(duration, max(start, float(block.get("end", start))))
        speaker = dominant_speaker_for_range(raw_segments, start, end) or previous_speaker
        prepared.append({"speaker": speaker, "text": text, "start": start, "end": end})
        previous_speaker = speaker

    next_speaker: int | None = None
    for block in reversed(prepared):
        if block["speaker"] is None:
            block["speaker"] = next_speaker
        else:
            next_speaker = block["speaker"]

    merged: list[dict[str, Any]] = []
    for block in prepared:
        if merged and merged[-1]["speaker"] == block["speaker"]:
            merged[-1]["text"] = join_transcript(merged[-1]["text"], block["text"])
            merged[-1]["end"] = block["end"]
        else:
            merged.append(block)
    return merged or [{"speaker": None, "text": "", "start": 0.0, "end": duration}]


def read_wav(path: Path):
    import numpy as np

    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        sample_rate = source.getframerate()
        width = source.getsampwidth()
        frames = source.readframes(source.getnframes())
    if width != 2:
        raise RuntimeError("복구 오디오는 16-bit PCM이어야 합니다")
    audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, sample_rate


def run_mock(args: argparse.Namespace) -> None:
    emit("download", progress=1.0, message="테스트 전사 엔진 준비 완료")
    if os.environ.get("ULPASO_ASR_RECOVERY") == "1":
        time.sleep(float(os.environ.get("ULPASO_ASR_RECOVERY_READY_DELAY", "0") or 0))
    emit("ready")
    chunk_index = 0
    stable_parts: list[str] = []
    examples = [
        "미팅 노트 전사를 시작했습니다.",
        "지금 들리는 내용이 문서에 바로 기록됩니다.",
        "종료하면 화자별 문장으로 정리합니다.",
    ]
    crash_after = int(os.environ.get("ULPASO_ASR_CRASH_AFTER_CHUNKS", "0") or 0)
    recovery_worker = os.environ.get("ULPASO_ASR_RECOVERY") == "1"
    crash_during_recovery = os.environ.get("ULPASO_ASR_CRASH_DURING_RECOVERY") == "1"
    while True:
        frame = read_frame()
        if frame is None:
            return
        kind, _ = frame
        if kind == 1:
            text = examples[chunk_index % len(examples)]
            stable_parts.append(text)
            chunk_index += 1
            emit(
                "transcript",
                stableText=" ".join(stable_parts),
                unstableText="",
                speakerId=((chunk_index - 1) % 2) + 1,
            )
            if (
                crash_after > 0
                and chunk_index >= crash_after
                and (not recovery_worker or crash_during_recovery)
            ):
                os._exit(91)
        elif kind == 2:
            emit("finalizing", progress=0.5, message="테스트 화자를 정리하고 있습니다")
            time.sleep(0.15)
            segments = [
                {"speaker": (index % 2) + 1, "text": text, "start": index * 2.0, "end": (index + 1) * 2.0}
                for index, text in enumerate(stable_parts)
            ]
            emit("final", text=" ".join(stable_parts), segments=segments)
            return
        elif kind == 3:
            return


def run_real(args: argparse.Namespace) -> None:
    import numpy as np
    import mlx.core as mx
    from mlx_qwen3_asr import Session
    from mlx_audio.vad import load as load_diarization

    # MLX otherwise retains several gigabytes of transient Metal allocations.
    # Bound the cache so a 16 GB Mac stays responsive during long meetings.
    mx.set_cache_limit(512 * 1024 * 1024)

    configure_streaming_join_rules()
    root = Path(args.model_dir)
    asr_path = prepare_model(ASR_REPO, root / "qwen3-asr-0.6b-8bit", 0.0, 0.81, "로컬 전사 모델을 준비하고 있습니다")
    diar_path = prepare_model(DIAR_REPO, root / "sortformer-v2.1-fp16", 0.81, 1.0, "화자 구분 모델을 준비하고 있습니다")

    emit("loading", message="전사 모델을 메모리에 올리고 있습니다")
    session = Session(model=str(asr_path))
    def new_streaming_state():
        return session.init_streaming(
            context=MEETING_CONTEXT,
            unfixed_chunk_num=1,
            unfixed_token_num=2,
            chunk_size_sec=2.0,
            max_context_sec=30.0,
            endpointing_mode="energy",
            finalization_mode="accuracy",
        )

    asr_state = new_streaming_state()
    emit("loading", message="화자 구분 모델을 메모리에 올리고 있습니다")
    diar_model = load_diarization(str(diar_path))
    diar_state = diar_model.init_streaming_state()
    emit("ready")

    last_stable = ""
    last_text = ""
    refined_parts: list[str] = []
    refined_blocks: list[dict[str, Any]] = []
    live_diar_segments: list[Any] = []
    block_diar_segments: list[Any] = []
    block_chunks: list[Any] = []
    block_samples = 0
    processed_samples = 0
    refine_samples = int(16000 * ROLLING_REFINE_SECONDS)
    while True:
        frame = read_frame()
        if frame is None:
            return
        kind, payload = frame
        if kind == 3:
            return
        if kind == 1:
            if not payload:
                continue
            pcm = np.frombuffer(payload, dtype="<f4").astype(np.float32, copy=False)
            block_chunks.append(pcm)
            block_samples += len(pcm)
            processed_samples += len(pcm)
            asr_state = session.feed_audio(pcm, asr_state)
            speaker = None
            try:
                diar_result, diar_state = diar_model.feed(
                    pcm,
                    diar_state,
                    sample_rate=16000,
                    threshold=DIARIZATION_THRESHOLD,
                    min_duration=0.64,
                    merge_gap=0.24,
                )
                new_diar_segments = list(getattr(diar_result, "segments", []) or [])
                live_diar_segments.extend(new_diar_segments)
                block_diar_segments.extend(new_diar_segments)
                speaker = choose_live_speaker(diar_result)
            except Exception:
                speaker = None
            stream_language = getattr(asr_state, "language", None)
            stream_stable = sanitize_stream_text(
                str(getattr(asr_state, "stable_text", "") or ""),
                stream_language,
            )
            stream_text = sanitize_stream_text(
                str(getattr(asr_state, "text", "") or ""),
                stream_language,
            )
            if block_samples >= refine_samples:
                block_audio = np.concatenate(block_chunks)
                block_end = processed_samples / 16000.0
                block_start = max(0.0, block_end - len(block_audio) / 16000.0)
                activity = speech_activity_ratio(block_diar_segments, block_start, block_end)
                refined, refined_language = transcribe_meeting_audio(
                    session,
                    block_audio,
                    16000,
                    speech_activity=activity,
                )
                refined = sanitize_stream_text(refined, refined_language)
                suppressed = should_suppress_low_speech_hallucination(refined_language, activity)
                block_text = "" if suppressed else refined or stream_text
                refined_parts.append(block_text)
                refined_blocks.append({
                    "start": block_start,
                    "end": block_end,
                    "text": block_text,
                })
                block_chunks = []
                block_samples = 0
                block_diar_segments = []
                asr_state = new_streaming_state()
                stream_stable = ""
                stream_text = ""
            prefix = join_transcript(*refined_parts)
            stable = join_transcript(prefix, stream_stable)
            text = join_transcript(prefix, stream_text)
            unstable = text[len(stable):].lstrip() if text.startswith(stable) else text
            if stable != last_stable or text != last_text:
                emit("transcript", stableText=stable, unstableText=unstable, speakerId=speaker)
                last_stable, last_text = stable, text
        elif kind == 2:
            stream_language = getattr(asr_state, "language", None)
            pre_finalize_text = sanitize_stream_text(
                str(getattr(asr_state, "text", "") or ""),
                stream_language,
            )
            # mlx-qwen3-asr 0.3.5 falls back to the default fp16 repo when its
            # internal tail-refine receives a preloaded model object. Run the
            # same accuracy pass through this Session so the local tokenizer
            # and weights are reused and no second model is downloaded.
            stream_final_text = pre_finalize_text
            # An exact 20-second boundary has already been refined and resets
            # the streaming state. Do not finalize an empty state in that case.
            if block_chunks:
                asr_state.enable_tail_refine = False
                asr_state = session.finish_streaming(asr_state)
                stream_final_text = sanitize_stream_text(
                    str(getattr(asr_state, "text", "") or ""),
                    getattr(asr_state, "language", None),
                )
            if block_chunks:
                block_audio = np.concatenate(block_chunks)
                block_end = processed_samples / 16000.0
                block_start = max(0.0, block_end - len(block_audio) / 16000.0)
                activity = speech_activity_ratio(block_diar_segments, block_start, block_end)
                refined_text, refined_language = transcribe_meeting_audio(
                    session,
                    block_audio,
                    16000,
                    speech_activity=activity,
                )
                refined_text = sanitize_stream_text(refined_text, refined_language)
                suppressed = should_suppress_low_speech_hallucination(refined_language, activity)
                block_text = "" if suppressed else refined_text or stream_final_text or pre_finalize_text
                refined_parts.append(block_text)
                refined_blocks.append({
                    "start": block_start,
                    "end": block_end,
                    "text": block_text,
                })
            final_text = join_transcript(*refined_parts)
            emit("transcript", stableText=final_text, unstableText="", speakerId=None)
            segments = finalize_speakers(
                Path(args.audio_path),
                session,
                diar_model,
                final_text,
                live_diar_segments=live_diar_segments,
                refined_blocks=refined_blocks,
                duration_hint=processed_samples / 16000.0,
            )
            emit("final", text=final_text, segments=segments)
            return


def finalize_speakers(
    audio_path: Path,
    session: Any,
    diar_model: Any,
    fallback_text: str,
    *,
    live_diar_segments: list[Any] | None = None,
    refined_blocks: list[dict[str, Any]] | None = None,
    duration_hint: float | None = None,
) -> list[dict[str, Any]]:
    import numpy as np

    if not audio_path.exists():
        return [{"speaker": None, "text": fallback_text, "start": None, "end": None}]
    duration = duration_hint if duration_hint is not None else wav_duration(audio_path)
    if duration >= LONG_MEETING_SECONDS and refined_blocks:
        emit("finalizing", progress=0.92, message="장시간 미팅의 화자 구간을 정리하고 있습니다")
        return build_rolling_speaker_segments(refined_blocks, live_diar_segments or [], duration)
    audio, sample_rate = read_wav(audio_path)
    duration = len(audio) / float(sample_rate)
    emit("finalizing", progress=0.08, message="전체 오디오에서 화자 구간을 정리하고 있습니다")
    output = diar_model.generate(
        str(audio_path),
        threshold=DIARIZATION_THRESHOLD,
        min_duration=0.7,
        merge_gap=0.24,
    )
    raw_segments = list(getattr(output, "segments", []) or [])
    turns = merge_turns(
        raw_segments,
        duration,
        getattr(output, "speaker_probs", None),
    )
    if not turns:
        return [{"speaker": None, "text": fallback_text, "start": 0.0, "end": duration}]

    # Splitting a single-speaker recording into short diarization turns lowers
    # ASR accuracy and can clip Korean syllables at each boundary. Preserve the
    # speaker label, but use one full-context accuracy pass for monologues.
    speakers = {int(turn["speaker"]) for turn in turns}
    if len(speakers) == 1:
        emit("finalizing", progress=0.95, message="전체 문장을 정확하게 정리하고 있습니다")
        text = transcribe_audio_windowed(session, audio, sample_rate)
        if text:
            return [{
                "speaker": next(iter(speakers)),
                "text": text,
                "start": 0.0,
                "end": duration,
            }]

    final_segments: list[dict[str, Any]] = []
    for index, turn in enumerate(turns):
        start_sample = max(0, int((turn["start"] - 0.15) * sample_rate))
        end_sample = min(len(audio), int((turn["end"] + 0.15) * sample_rate))
        if end_sample <= start_sample:
            continue
        emit(
            "finalizing",
            progress=0.12 + 0.86 * ((index + 1) / max(1, len(turns))),
            message=f"화자별 문장을 정리하고 있습니다 · {index + 1}/{len(turns)}",
        )
        try:
            text = transcribe_audio_windowed(
                session,
                np.asarray(audio[start_sample:end_sample]),
                sample_rate,
            )
        except Exception:
            text = ""
        if text:
            final_segments.append({
                "speaker": turn["speaker"],
                "text": text,
                "start": round(turn["start"], 3),
                "end": round(turn["end"], 3),
            })

    if not final_segments:
        return [{"speaker": None, "text": fallback_text, "start": 0.0, "end": duration}]
    return final_segments


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--audio-path", required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--mock", action="store_true")
    args = parser.parse_args()
    try:
        if args.mock:
            run_mock(args)
        else:
            run_real(args)
    except Exception as error:
        emit("error", code="worker_exception", message=f"로컬 전사 엔진 오류: {error}")
        raise


if __name__ == "__main__":
    main()
