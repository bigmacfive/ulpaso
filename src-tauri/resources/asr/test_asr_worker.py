import unittest
import sys
import tempfile
import wave
from pathlib import Path
from types import ModuleType
from types import SimpleNamespace
from unittest.mock import patch

from asr_worker import (
    ASR_REPO,
    DIARIZATION_THRESHOLD,
    DownloadReporter,
    MODEL_REVISIONS,
    build_rolling_speaker_segments,
    contains_unexpected_script,
    configure_streaming_join_rules,
    choose_silence_boundary,
    has_excessive_repetition,
    finalize_speakers,
    join_transcript,
    merge_transcript_text,
    merge_turns,
    needs_korean_retry,
    polish_meeting_transcript,
    prepare_model,
    retry_language,
    sanitize_stream_text,
    should_suppress_low_speech_hallucination,
    speech_activity_ratio,
    transcribe_audio_windowed,
    transcribe_meeting_audio,
)


class FakeSession:
    def __init__(self, results):
        self.results = iter(results)
        self.calls = []

    def transcribe(self, audio, **kwargs):
        self.calls.append(kwargs)
        return next(self.results)


class MeetingTranscriptionTests(unittest.TestCase):
    def test_korean_streaming_chunks_use_word_spacing_join_rules(self):
        aliases = {"chinese", "japanese", "korean", "ko", "kr"}
        configure_streaming_join_rules(aliases)
        self.assertEqual(aliases, {"chinese", "japanese"})

    def test_stream_sanitizer_removes_foreign_script_hallucination(self):
        text = (
            "엄청 로맨틱한 곳에서 지금 인사를 해 주셨습니다. "
            "조금 추워서 들어가고 싶어요 就就死掉了 다시 얘기해요"
        )
        self.assertEqual(
            sanitize_stream_text(text, "Korean"),
            "엄청 로맨틱한 곳에서 지금 인사를 해 주셨습니다. "
            "조금 추워서 들어가고 싶어요 다시 얘기해요",
        )

    def test_stream_sanitizer_preserves_intended_language(self):
        self.assertEqual(sanitize_stream_text("这是中文内容", "Chinese"), "这是中文内容")

    def test_final_korean_block_is_tidied_without_touching_english(self):
        self.assertEqual(
            polish_meeting_transcript("어, 근데 보면은 이제 시작합니다.", "Korean"),
            "그런데 보면 이제 시작합니다.",
        )
        self.assertEqual(
            polish_meeting_transcript("Ah, but now we begin.", "English"),
            "Ah, but now we begin.",
        )

    def test_speech_activity_unions_overlapping_speakers(self):
        segments = [
            SimpleNamespace(start=0.0, end=4.0),
            SimpleNamespace(start=2.0, end=6.0),
            SimpleNamespace(start=9.0, end=12.0),
        ]
        self.assertAlmostEqual(speech_activity_ratio(segments, 0.0, 10.0), 0.7)

    def test_unexpected_language_with_little_speech_is_suppressed(self):
        self.assertTrue(should_suppress_low_speech_hallucination("Chinese", 0.19))
        self.assertFalse(should_suppress_low_speech_hallucination("Chinese", 0.4))
        self.assertFalse(should_suppress_low_speech_hallucination("Korean", 0.05))
        session = FakeSession([
            SimpleNamespace(text="哦耶, turns out everything nice", language="Chinese"),
        ])
        self.assertEqual(
            transcribe_meeting_audio(
                session,
                [0.0] * 4_000,
                16000,
                speech_activity=0.19,
            ),
            ("", "Chinese"),
        )
        self.assertEqual(len(session.calls), 1)

    def test_download_reporter_combines_completed_and_resumed_file_bytes(self):
        events = []
        reporter = DownloadReporter(0.1, 0.9, 1_000, "모델 다운로드")
        with patch("asr_artifacts.emit", side_effect=lambda kind, **payload: events.append((kind, payload))):
            reporter.finish_file(400)
            reporter.progress(300, force=True)
            reporter.finish_file(600)

        progress = [payload["progress"] for kind, payload in events if kind == "download"]
        self.assertEqual(progress, sorted(progress))
        self.assertAlmostEqual(progress[0], 0.42)
        self.assertAlmostEqual(progress[1], 0.66)
        self.assertAlmostEqual(progress[-1], 0.9)

    def test_prepare_model_downloads_only_missing_files_at_one_revision(self):
        fake_hub = ModuleType("huggingface_hub")
        revision = MODEL_REVISIONS[ASR_REPO]
        files = [
            SimpleNamespace(file_size=400, filename="config.json", commit_hash=revision, will_download=False),
            SimpleNamespace(file_size=600, filename="model.safetensors", commit_hash=revision, will_download=True),
        ]
        calls = []
        snapshot_calls = []
        fake_hub.snapshot_download = lambda **kwargs: snapshot_calls.append(kwargs) or files
        fake_hub.hf_hub_download = lambda **kwargs: calls.append(kwargs)

        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(sys.modules, {"huggingface_hub": fake_hub}), \
             patch("asr_artifacts.verify_model", side_effect=[False, True]), \
             patch("asr_artifacts.emit"):
            result = prepare_model(ASR_REPO, Path(directory), 0.0, 1.0, "모델")

        self.assertEqual(result, Path(directory))
        self.assertEqual(snapshot_calls[0]["revision"], revision)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["filename"], "model.safetensors")
        self.assertEqual(calls[0]["revision"], revision)

    def test_script_guard_accepts_korean_and_english(self):
        self.assertFalse(contains_unexpected_script("안녕하세요. Qwen meeting을 시작합니다."))

    def test_script_guard_rejects_devanagari_hallucination(self):
        self.assertTrue(contains_unexpected_script("हमारी चारपाई जहाँ रखनी है वहाँ रख दो"))
        self.assertTrue(needs_korean_retry("हमारी चारपाई", "Hindi"))

    def test_repetition_guard_rejects_short_audio_hallucination(self):
        hallucination = "2022년 1월 20일 2022년 1월 20일 2022년 1월 20일 2022년 1월 20일"
        self.assertTrue(has_excessive_repetition(hallucination))
        self.assertTrue(needs_korean_retry(hallucination, "Korean"))
        self.assertFalse(has_excessive_repetition("오늘 회의에서는 첫 번째 안건과 두 번째 안건을 차례로 검토합니다"))

    def test_unexpected_language_is_retried_as_korean(self):
        session = FakeSession([
            SimpleNamespace(text="हमारी चारपाई", language="Hindi"),
            SimpleNamespace(text="지금 무슨 얘기를 하시려고요?", language="Korean"),
        ])
        text, language = transcribe_meeting_audio(session, [0.0] * 4_000, 16000)
        self.assertEqual(text, "지금 무슨 얘기를 하시려고요?")
        self.assertEqual(language, "Korean")
        self.assertEqual(session.calls[1]["language"], "Korean")

    def test_auto_detected_latin_language_is_not_forced_to_korean(self):
        session = FakeSession([
            SimpleNamespace(text="Wir beginnen jetzt mit dem Meeting.", language="German"),
        ])
        text, language = transcribe_meeting_audio(session, [0.0] * 4_000, 16000)
        self.assertEqual(text, "Wir beginnen jetzt mit dem Meeting.")
        self.assertEqual(language, "German")
        self.assertEqual(len(session.calls), 1)

    def test_tiny_audio_tail_is_ignored_without_invoking_model(self):
        session = FakeSession([])
        self.assertEqual(transcribe_meeting_audio(session, [0.0] * 100, 16000), ("", ""))
        self.assertEqual(session.calls, [])

    def test_bad_english_decode_is_retried_as_english(self):
        session = FakeSession([
            SimpleNamespace(text="Welcome 就就死掉了 back to the show", language="English"),
            SimpleNamespace(text="Welcome back to the show", language="English"),
        ])
        text, language = transcribe_meeting_audio(session, [0.0] * 4_000, 16000)
        self.assertEqual(text, "Welcome back to the show")
        self.assertEqual(language, "English")
        self.assertEqual(session.calls[1]["language"], "English")

    def test_retry_language_uses_script_when_detection_is_unknown(self):
        self.assertEqual(retry_language("회의 내용을 就就死掉了 정리합니다", "Chinese"), "Korean")
        self.assertEqual(retry_language("welcome back 就就死掉了", "Chinese"), "English")

    def test_join_transcript_normalizes_block_boundaries(self):
        self.assertEqual(join_transcript(" 첫 문장 ", "", " 다음 문장"), "첫 문장 다음 문장")

    def test_overlapping_transcript_windows_are_deduplicated(self):
        self.assertEqual(
            merge_transcript_text("오늘 회의 안건을 설명합니다", "회의 안건을 설명합니다 다음 내용입니다"),
            "오늘 회의 안건을 설명합니다 다음 내용입니다",
        )

    def test_silence_boundary_prefers_quiet_valley_near_target(self):
        import numpy as np

        audio = np.ones(2_400, dtype=np.float32) * 0.2
        audio[1_780:1_820] = 0.0
        boundary = choose_silence_boundary(audio, sample_rate=100)
        self.assertGreaterEqual(boundary, 1_760)
        self.assertLessEqual(boundary, 1_840)

    def test_long_meeting_segments_reuse_bounded_live_blocks(self):
        diarization = [
            SimpleNamespace(speaker=0, start=0.0, end=38.0),
            SimpleNamespace(speaker=1, start=40.0, end=60.0),
        ]
        blocks = [
            {"start": 0.0, "end": 20.0, "text": "첫 번째 블록"},
            {"start": 20.0, "end": 40.0, "text": "두 번째 블록"},
            {"start": 40.0, "end": 60.0, "text": "세 번째 블록"},
        ]
        self.assertEqual(
            build_rolling_speaker_segments(blocks, diarization, 60.0),
            [
                {"speaker": 1, "text": "첫 번째 블록 두 번째 블록", "start": 0.0, "end": 40.0},
                {"speaker": 2, "text": "세 번째 블록", "start": 40.0, "end": 60.0},
            ],
        )

    def test_six_hour_finalize_uses_only_compact_text_blocks(self):
        blocks = [
            {"start": index * 20.0, "end": (index + 1) * 20.0, "text": f"블록 {index}"}
            for index in range(1_080)
        ]
        diarization = [
            SimpleNamespace(speaker=(index // 90) % 2, start=index * 20.0, end=(index + 1) * 20.0)
            for index in range(1_080)
        ]
        segments = build_rolling_speaker_segments(blocks, diarization, 21_600.0)
        self.assertEqual(segments[0]["start"], 0.0)
        self.assertEqual(segments[-1]["end"], 21_600.0)
        self.assertLessEqual(len(segments), 12)
        self.assertIn("블록 1079", segments[-1]["text"])

    def test_long_finalize_does_not_run_full_file_diarization(self):
        class FailingDiarizer:
            def generate(self, *_args, **_kwargs):
                raise AssertionError("long meetings must not run full-file diarization")

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "meeting.wav"
            with wave.open(str(path), "wb") as target:
                target.setnchannels(1)
                target.setsampwidth(2)
                target.setframerate(16_000)
                target.writeframes(b"\0\0" * 16)
            with patch("asr_worker.emit"):
                segments = finalize_speakers(
                    path,
                    object(),
                    FailingDiarizer(),
                    "긴 미팅",
                    refined_blocks=[{"start": 0.0, "end": 20.0, "text": "첫 블록"}],
                    duration_hint=3_600.0,
                )
        self.assertEqual(segments[0]["text"], "첫 블록")

    def test_long_final_turn_is_transcribed_in_bounded_windows(self):
        session = FakeSession([
            SimpleNamespace(text=f"문장 {index}", language="Korean")
            for index in range(7)
        ])
        text = transcribe_audio_windowed(
            session,
            [0.0] * 65,
            sample_rate=1,
            max_window_sec=10,
        )

        self.assertEqual(len(session.calls), 7)
        self.assertEqual(text, "문장 0 문장 1 문장 2 문장 3 문장 4 문장 5 문장 6")

    def test_short_false_speaker_is_folded_into_neighbor(self):
        raw = [
            SimpleNamespace(speaker=0, start=0.0, end=5.0),
            SimpleNamespace(speaker=3, start=5.1, end=6.0),
            SimpleNamespace(speaker=0, start=6.1, end=11.0),
        ]
        turns = merge_turns(raw, 11.0)
        self.assertEqual(turns, [{"speaker": 1, "start": 0.0, "end": 11.0}])

    def test_validated_diarization_threshold_stays_sensitive_to_quiet_speakers(self):
        self.assertEqual(DIARIZATION_THRESHOLD, 0.40)

    def test_overlapping_speech_is_assigned_once_to_higher_probability_speaker(self):
        raw = [
            SimpleNamespace(speaker=0, start=0.0, end=5.0),
            SimpleNamespace(speaker=1, start=3.0, end=8.0),
        ]
        probabilities = [
            [0.9, 0.1],
            [0.9, 0.1],
            [0.9, 0.1],
            [0.2, 0.9],
            [0.2, 0.9],
            [0.1, 0.9],
            [0.1, 0.9],
            [0.1, 0.9],
        ]
        turns = merge_turns(raw, 8.0, probabilities)

        self.assertEqual(turns, [
            {"speaker": 1, "start": 0.0, "end": 3.0},
            {"speaker": 2, "start": 3.0, "end": 8.0},
        ])


if __name__ == "__main__":
    unittest.main()
