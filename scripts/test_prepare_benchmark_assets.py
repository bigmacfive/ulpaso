import unittest
from pathlib import Path

from prepare_benchmark_assets import commands_for_sample


class PrepareBenchmarkAssetsTests(unittest.TestCase):
    def test_uses_manifest_caption_variant_and_stable_output_name(self):
        commands = commands_for_sample(
            {
                "id": "video-id",
                "title": "sample",
                "url": "https://www.youtube.com/watch?v=video-id",
                "subtitle": "video-id.ko-orig.json3",
            },
            Path("/tmp/assets"),
        )
        self.assertIn("ffmpeg:-ac 1 -ar 16000", commands[0])
        self.assertEqual(commands[1][commands[1].index("--sub-langs") + 1], "ko-orig")
        self.assertIn("/tmp/assets/video-id.%(ext)s", commands[1])

    def test_can_prepare_native_rate_capture_resampler_audio(self):
        commands = commands_for_sample(
            {
                "id": "video-id",
                "title": "sample",
                "url": "https://www.youtube.com/watch?v=video-id",
                "subtitle": "video-id.ko.json3",
            },
            Path("/tmp/assets"),
            capture_resampler=True,
        )

        self.assertEqual(len(commands), 3)
        self.assertIn("ffmpeg:-ac 1 -ar 48000", commands[1])
        self.assertIn("/tmp/assets/video-id.48k.%(ext)s", commands[1])
        self.assertIn("--skip-download", commands[2])


if __name__ == "__main__":
    unittest.main()
