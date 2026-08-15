import io
import json
import struct
import tempfile
import unittest
from pathlib import Path

from replay_meeting_worker import markdown_from_final, score_final_event, write_frame


class ReplayMeetingWorkerTests(unittest.TestCase):
    def test_frame_matches_worker_protocol(self):
        target = io.BytesIO()
        write_frame(target, 1, b"pcm")
        self.assertEqual(target.getvalue(), b"\x01" + struct.pack("<I", 3) + b"pcm")

    def test_final_segments_are_exported_as_standard_markdown(self):
        markdown = markdown_from_final(
            "미팅 노트",
            {
                "segments": [
                    {"speaker": 1, "text": "첫 문장"},
                    {"speaker": 2, "text": "다음 문장"},
                ]
            },
        )
        self.assertEqual(
            markdown,
            "## 미팅 노트\n\n**화자 1**\n\n첫 문장\n\n**화자 2**\n\n다음 문장\n",
        )

    def test_scores_the_document_segments_separately_from_full_text(self):
        captions = {
            "events": [
                {
                    "tStartMs": 0,
                    "dDurationMs": 1_000,
                    "segs": [{"utf8": "첫 문장 다음 문장"}],
                }
            ]
        }
        event = {
            "text": "첫 문장 다음 문장",
            "segments": [{"speaker": 1, "text": "첫 문장", "start": 0, "end": 0.4}],
        }
        with tempfile.TemporaryDirectory() as directory:
            subtitle = Path(directory) / "captions.json3"
            subtitle.write_text(json.dumps(captions, ensure_ascii=False), "utf-8")
            score = score_final_event(event, subtitle, "Korean")

        self.assertEqual(score["continuousWer"], 0.0)
        self.assertEqual(score["documentContinuousWer"], 0.5)
        self.assertFalse(score["documentMatchesFinalText"])
        self.assertTrue(score["captionedSpeechAfterLastTranscript"])

    def test_missing_segment_timestamps_cannot_claim_end_coverage(self):
        captions = {
            "events": [
                {
                    "tStartMs": 0,
                    "dDurationMs": 1_000,
                    "segs": [{"utf8": "끝 문장"}],
                }
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            subtitle = Path(directory) / "captions.json3"
            subtitle.write_text(json.dumps(captions, ensure_ascii=False), "utf-8")
            score = score_final_event(
                {"text": "끝 문장", "segments": [{"text": "끝 문장"}]},
                subtitle,
                "Korean",
            )

        self.assertIsNone(score["lastTranscriptEndSeconds"])
        self.assertTrue(score["captionedSpeechAfterLastTranscript"])


if __name__ == "__main__":
    unittest.main()
