import json
import tempfile
import unittest
from pathlib import Path

from full_video_asr_benchmark import caption_events, reference_for_window


class FullVideoBenchmarkTests(unittest.TestCase):
    def test_caption_is_assigned_once_by_its_midpoint(self):
        payload = {"events": [
            {"tStartMs": 19_500, "dDurationMs": 2_000, "segs": [{"utf8": "경계 문장"}]},
        ]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "caption.json3"
            path.write_text(json.dumps(payload, ensure_ascii=False), "utf-8")
            events = caption_events(path)
        self.assertEqual(reference_for_window(events, 0.0, 20.0), "")
        self.assertEqual(reference_for_window(events, 20.0, 40.0), "경계 문장")


if __name__ == "__main__":
    unittest.main()
