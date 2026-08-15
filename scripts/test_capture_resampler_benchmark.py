import math
import unittest
from pathlib import Path

from capture_resampler_benchmark import (
    FILTER_TAPS,
    capture_filter_coefficients,
    legacy_capture_resample,
    production_capture_resample,
    production_system_mix,
    summarize,
    transparent_system_mix,
)


class CaptureResamplerBenchmarkTests(unittest.TestCase):
    def test_filter_matches_production_shape_and_gain(self):
        coefficients = capture_filter_coefficients()
        self.assertEqual(len(coefficients), FILTER_TAPS)
        self.assertAlmostEqual(float(coefficients.sum()), 1.0, places=6)
        self.assertTrue(
            all(
                abs(float(left) - float(right)) < 1e-7
                for left, right in zip(coefficients, reversed(coefficients))
            )
        )

    def test_native_second_resamples_to_exact_asr_length(self):
        audio = [0.0] * 48_000
        self.assertEqual(len(legacy_capture_resample(audio)), 16_000)
        self.assertEqual(len(production_capture_resample(audio)), 16_000)

    def test_filter_suppresses_twelve_kilohertz_alias(self):
        import numpy as np

        audio = np.asarray(
            [
                math.sin(2.0 * math.pi * 12_000 * index / 48_000)
                for index in range(48_000)
            ],
            dtype=np.float32,
        )
        legacy = legacy_capture_resample(audio)[FILTER_TAPS:]
        improved = production_capture_resample(audio)[FILTER_TAPS:]
        legacy_rms = float(np.sqrt(np.mean(np.square(legacy, dtype=np.float64))))
        improved_rms = float(np.sqrt(np.mean(np.square(improved, dtype=np.float64))))
        self.assertLess(improved_rms, legacy_rms * 0.02)

    def test_system_mixer_paths_match_production_and_candidate(self):
        import numpy as np

        audio = np.asarray([-2.0, -0.5, 0.0, 0.5, 2.0], dtype=np.float32)
        current = production_system_mix(audio)
        expected = np.tanh(audio * np.float32(0.65))
        np.testing.assert_array_equal(current, expected)
        np.testing.assert_array_equal(
            transparent_system_mix(audio),
            np.asarray([-1.0, -0.5, 0.0, 0.5, 1.0], dtype=np.float32),
        )

    def test_benchmark_sample_applies_mixer_after_each_resampler(self):
        import json
        import tempfile
        import wave

        import numpy as np

        from capture_resampler_benchmark import benchmark_sample

        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory)
            audio_path = assets / "fixture.48k.wav"
            subtitle_path = assets / "fixture.en.json3"
            samples = np.asarray(
                [0.5 if index % 2 == 0 else -0.5 for index in range(48_000)],
                dtype=np.float32,
            )
            with wave.open(str(audio_path), "wb") as target:
                target.setnchannels(1)
                target.setsampwidth(4)
                target.setframerate(48_000)
                target.writeframes(samples.astype("<f4").tobytes())
            subtitle_path.write_text(json.dumps({"events": []}), "utf-8")
            prepared = []

            benchmark_sample(
                object(),
                {
                    "id": "fixture",
                    "title": "fixture",
                    "subtitle": subtitle_path.name,
                    "language": "English",
                    "referenceQuality": "manual",
                    "startSeconds": 0,
                    "endSeconds": 1,
                },
                assets,
                window_seconds=20.0,
                transcriber=lambda _session, audio, _rate, _seconds: (
                    prepared.append(np.asarray(audio).copy()) or ""
                ),
            )

        self.assertEqual(len(prepared), 3)
        legacy = legacy_capture_resample(samples)
        anti_aliased = production_capture_resample(samples)
        np.testing.assert_array_equal(prepared[0], production_system_mix(legacy))
        np.testing.assert_array_equal(prepared[1], production_system_mix(anti_aliased))
        np.testing.assert_array_equal(prepared[2], transparent_system_mix(anti_aliased))

    def test_summary_uses_only_manual_references_when_available(self):
        summary = summarize([
            {
                "referenceQuality": "manual",
                "audioSeconds": 120,
                "legacyCer": 0.2,
                "legacyWer": 0.3,
                "antiAliasedCer": 0.1,
                "antiAliasedWer": 0.2,
                "transparentSystemCer": 0.08,
                "transparentSystemWer": 0.18,
            },
            {
                "referenceQuality": "automatic-original",
                "audioSeconds": 120,
                "legacyCer": 0.9,
                "legacyWer": 0.9,
                "antiAliasedCer": 0.9,
                "antiAliasedWer": 0.9,
                "transparentSystemCer": 0.9,
                "transparentSystemWer": 0.9,
            },
        ])
        self.assertEqual(summary["legacyMeanWer"], 0.3)
        self.assertEqual(summary["antiAliasedMeanWer"], 0.2)
        self.assertEqual(summary["transparentSystemMeanWer"], 0.18)
        self.assertEqual(summary["audioSeconds"], 240)


if __name__ == "__main__":
    unittest.main()
