import json
import tempfile
import unittest
from pathlib import Path

from podcast_asr_benchmark import (
    character_units,
    edit_distance,
    error_rate,
    parse_youtube_json3,
    percentile,
    slice_audio_range,
    summarize,
    word_units,
)


class PodcastBenchmarkTests(unittest.TestCase):
    def test_json3_parser_keeps_only_requested_time_range(self):
        payload = {
            "events": [
                {"tStartMs": 0, "dDurationMs": 1000, "segs": [{"utf8": "처음"}]},
                {"tStartMs": 1500, "dDurationMs": 1000, "segs": [{"utf8": "중간\n문장"}]},
                {"tStartMs": 3000, "dDurationMs": 1000, "segs": [{"utf8": "끝"}]},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "caption.json3"
            path.write_text(json.dumps(payload, ensure_ascii=False), "utf-8")
            self.assertEqual(parse_youtube_json3(path, 1.0, 3.0), "중간 문장")

    def test_character_units_ignore_spacing_punctuation_and_annotations(self):
        self.assertEqual(character_units("[음악] 안녕, 하세요!"), list("안녕하세요"))

    def test_word_units_preserve_korean_and_english_terms(self):
        self.assertEqual(word_units("Qwen 모델을 테스트해요", "Korean"), ["qwen", "모델을", "테스트해요"])

    def test_edit_distance_and_error_rate(self):
        self.assertEqual(edit_distance(list("가나다"), list("가마")), 2)
        self.assertAlmostEqual(error_rate(list("가나다"), list("가마")), 2 / 3)

    def test_percentile_uses_nearest_rank(self):
        self.assertEqual(percentile([0.1, 0.2, 0.3, 0.4], 0.95), 0.4)

    def test_audio_range_honors_nonzero_manifest_start(self):
        self.assertEqual(slice_audio_range(list(range(10)), 2, 1.0, 3.0), [2, 3, 4, 5])

    def test_summary_reports_trusted_rolling_accuracy_and_latency(self):
        result = summarize([{
            "referenceQuality": "manual",
            "finishedCer": 0.3,
            "finishedWer": 0.4,
            "feedP95Seconds": 0.2,
            "firstStableAudioSeconds": 4.0,
            "stableRewrites": 0,
            "rollingCer": 0.1,
            "rollingWer": 0.2,
            "rollingFeedP95Seconds": 1.2,
            "rollingFeedMaxSeconds": 1.5,
            "rollingRealTimeFactor": 0.15,
        }])
        self.assertEqual(result["meanTrustedRollingWer"], 0.2)
        self.assertEqual(result["maxRollingFeedP95Seconds"], 1.2)


if __name__ == "__main__":
    unittest.main()
