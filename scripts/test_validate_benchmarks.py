import json
import tempfile
import unittest
from pathlib import Path

from validate_benchmarks import validate_directory, validate_samples


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class BenchmarkMetadataValidationTests(unittest.TestCase):
    def test_committed_benchmark_metadata_is_consistent(self):
        validate_directory(PROJECT_ROOT / "benchmarks")

    def test_rejects_duplicate_or_mismatched_youtube_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "samples.json"
            path.write_text(json.dumps([
                {
                    "id": "expected",
                    "url": "https://www.youtube.com/watch?v=different",
                    "referenceQuality": "manual",
                    "startSeconds": 0,
                    "endSeconds": 10,
                    "subtitle": "expected.ko.json3",
                }
            ]), "utf-8")
            with self.assertRaisesRegex(ValueError, "URL does not identify"):
                validate_samples(path)


if __name__ == "__main__":
    unittest.main()
