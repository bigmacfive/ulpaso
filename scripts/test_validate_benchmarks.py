import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from validate_benchmarks import (
    validate_capture_resampler_results,
    validate_combined_mixer_results,
    validate_diarization_results,
    validate_directory,
    validate_full_video_results,
    validate_model_selection_results,
    validate_podcast_results,
    validate_samples,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class BenchmarkMetadataValidationTests(unittest.TestCase):
    def _load_committed_result(self, filename):
        return json.loads((PROJECT_ROOT / "benchmarks" / filename).read_text("utf-8"))

    def _assert_podcast_result_rejected(self, result, message):
        samples = validate_samples(PROJECT_ROOT / "benchmarks" / "podcast_samples.json")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "latest_results.json"
            path.write_text(json.dumps(result), "utf-8")
            with self.assertRaisesRegex(ValueError, message):
                validate_podcast_results(path, samples)

    def _assert_full_video_result_rejected(self, result, message):
        samples = validate_samples(PROJECT_ROOT / "benchmarks" / "full_video_samples.json")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "full_video_latest_results.json"
            path.write_text(json.dumps(result), "utf-8")
            with self.assertRaisesRegex(ValueError, message):
                validate_full_video_results(path, samples)

    def _assert_capture_result_rejected(self, result, message):
        samples = validate_samples(PROJECT_ROOT / "benchmarks" / "podcast_samples.json")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "capture_resampler_latest_results.json"
            path.write_text(json.dumps(result), "utf-8")
            with self.assertRaisesRegex(ValueError, message):
                validate_capture_resampler_results(path, samples)

    def _assert_combined_mixer_result_rejected(self, result, message):
        samples = validate_samples(PROJECT_ROOT / "benchmarks" / "podcast_samples.json")
        capture_result = self._load_committed_result(
            "capture_resampler_latest_results.json"
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "combined_mixer_latest_results.json"
            path.write_text(json.dumps(result), "utf-8")
            with self.assertRaisesRegex(ValueError, message):
                validate_combined_mixer_results(path, samples, capture_result)

    def _assert_model_selection_result_rejected(self, result, message):
        samples = validate_samples(PROJECT_ROOT / "benchmarks" / "podcast_samples.json")
        capture_result = self._load_committed_result(
            "capture_resampler_latest_results.json"
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model_selection_latest_results.json"
            path.write_text(json.dumps(result), "utf-8")
            with self.assertRaisesRegex(ValueError, message):
                validate_model_selection_results(path, samples, capture_result)

    def _assert_diarization_result_rejected(self, result, message):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "diarization_latest_results.json"
            path.write_text(json.dumps(result), "utf-8")
            with self.assertRaisesRegex(ValueError, message):
                validate_diarization_results(path)

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

    def test_rejects_stale_manual_podcast_aggregates(self):
        aggregate_keys = (
            "manualLiveMeanCer",
            "manualLiveMeanWer",
            "manualRollingMeanCer",
            "manualRollingMeanWer",
        )
        for key in aggregate_keys:
            with self.subTest(key=key):
                result = self._load_committed_result("latest_results.json")
                result[key] = round(result[key] + 0.0001, 4)
                self._assert_podcast_result_rejected(result, rf"{key} is stale")

    def test_rejects_podcast_reference_quality_mismatch(self):
        result = self._load_committed_result("latest_results.json")
        result["samples"][0]["referenceQuality"] = "automatic-original"
        self._assert_podcast_result_rejected(
            result,
            "referenceQuality does not match podcast_samples.json",
        )

    def test_rejects_manual_podcast_rolling_quality_regressions(self):
        cases = (
            ("rollingCer", "liveCer", "manualRollingMeanCer", "CER"),
            ("rollingWer", "liveWer", "manualRollingMeanWer", "WER"),
        )
        for rolling_key, live_key, aggregate_key, label in cases:
            with self.subTest(metric=label):
                result = self._load_committed_result("latest_results.json")
                manual_rows = [
                    row
                    for row in result["samples"]
                    if row["referenceQuality"] == "manual"
                ]
                for row in manual_rows:
                    row[rolling_key] = round(row[live_key] + 0.01, 4)
                decimal_values = [
                    Decimal(str(row[rolling_key])) for row in manual_rows
                ]
                result[aggregate_key] = float(
                    round(sum(decimal_values) / len(decimal_values), 4)
                )
                self._assert_podcast_result_rejected(
                    result,
                    rf"manual rolling {label} is worse than live",
                )

    def test_rejects_full_video_improved_quality_regressions(self):
        for key in ("continuousWer", "groupedCer"):
            with self.subTest(metric=key):
                result = self._load_committed_result("full_video_latest_results.json")
                result["improved"][key] = round(result["baseline"][key] + 0.0001, 4)
                self._assert_full_video_result_rejected(
                    result,
                    rf"improved {key} is worse than baseline",
                )

    def test_rejects_untested_full_video_window_change(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["improved"]["windowSeconds"] = 25
        self._assert_full_video_result_rejected(
            result,
            r"full-video accuracy window must remain 20 seconds",
        )

    def test_rejects_unsupported_full_video_window_decision(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["windowScreen"]["candidateContinuousWordEdits"] = (
            result["improved"]["continuousWordEdits"] - 1
        )
        self._assert_full_video_result_rejected(
            result,
            r"25-second window rejection is not supported by word edits",
        )

    def test_rejects_unsafe_korean_numeral_formatting(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["koreanNumeralFormatting"]["semanticFalsePositives"] = 1
        self._assert_full_video_result_rejected(
            result,
            r"Korean numeral formatting quality gate failed",
        )

    def test_rejects_korean_numeral_regression_on_manual_podcasts(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["koreanNumeralFormatting"]["manualPodcastWordEditDelta"] = 1
        self._assert_full_video_result_rejected(
            result,
            r"Korean numeral formatting quality gate failed",
        )

    def test_rejects_production_replay_without_validated_numerals(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["productionWorkerReplay"]["continuousWordEdits"] += 1
        result["productionWorkerReplay"]["documentWordEdits"] += 1
        self._assert_full_video_result_rejected(
            result,
            r"production replay does not include the validated numeral formatting",
        )

    def test_rejects_production_replay_quality_beyond_tolerance(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["productionWorkerReplay"]["continuousWer"] = round(
            result["improved"]["continuousWer"] + 0.0101,
            4,
        )
        self._assert_full_video_result_rejected(
            result,
            r"productionWorkerReplay continuousWer is more than 0.01 worse than improved",
        )

    def test_accepts_production_replay_at_tolerance(self):
        result = self._load_committed_result("full_video_latest_results.json")
        tolerance_value = float(
            Decimal(str(result["improved"]["continuousWer"])) + Decimal("0.01")
        )
        result["productionWorkerReplay"]["continuousWer"] = tolerance_value
        result["productionWorkerReplay"]["documentContinuousWer"] = tolerance_value
        result["koreanNumeralFormatting"]["candidateContinuousWer"] = tolerance_value
        samples = validate_samples(
            PROJECT_ROOT / "benchmarks" / "full_video_samples.json"
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "full_video_latest_results.json"
            path.write_text(json.dumps(result), "utf-8")
            validate_full_video_results(path, samples)

    def test_rejects_production_replay_that_loses_text_in_document_segments(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["productionWorkerReplay"]["documentMatchesFinalText"] = False
        result["productionWorkerReplay"]["documentContinuousWer"] = 0.4
        self._assert_full_video_result_rejected(
            result,
            r"document segments do not preserve the final text",
        )

    def test_rejects_production_replay_document_edit_mismatch(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["productionWorkerReplay"]["documentWordEdits"] += 1
        self._assert_full_video_result_rejected(
            result,
            r"document word edits differ from final text",
        )

    def test_rejects_partial_production_audio_replay(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["productionWorkerReplay"]["processedAudioSeconds"] -= 20
        self._assert_full_video_result_rejected(
            result,
            r"production replay did not process the full audio",
        )

    def test_rejects_short_replay_disguised_as_full_video(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["audioSeconds"] = 10
        result["productionWorkerReplay"]["processedAudioSeconds"] = 10
        self._assert_full_video_result_rejected(
            result,
            r"full-video benchmark must cover at least five minutes",
        )

    def test_rejects_replay_duration_that_differs_from_manifest(self):
        result = self._load_committed_result("full_video_latest_results.json")
        result["audioSeconds"] = 600
        result["productionWorkerReplay"]["processedAudioSeconds"] = 600
        self._assert_full_video_result_rejected(
            result,
            r"audioSeconds does not match full_video_samples.json",
        )

    def test_rejects_capture_resampler_quality_regression(self):
        result = self._load_committed_result("capture_resampler_latest_results.json")
        for row in result["samples"]:
            row["antiAliasedWer"] = 0.9
        self._assert_capture_result_rejected(
            result,
            r"anti-aliased mean WER is worse than legacy",
        )

    def test_rejects_system_only_level_regression(self):
        result = self._load_committed_result("capture_resampler_latest_results.json")
        for row in result["samples"]:
            row["transparentSystemWer"] = 0.9
        self._assert_capture_result_rejected(
            result,
            r"transparent system mean WER is worse than anti-aliased",
        )

    def test_rejects_stale_capture_resampler_aggregate(self):
        result = self._load_committed_result("capture_resampler_latest_results.json")
        result["antiAliasedMeanCer"] += 0.0001
        self._assert_capture_result_rejected(
            result,
            r"antiAliasedMeanCer is stale",
        )

    def test_rejects_capture_resampler_manual_reference_subset(self):
        result = self._load_committed_result("capture_resampler_latest_results.json")
        result["samples"] = result["samples"][:1]
        result["sampleCount"] = 1
        result["manualReferenceCount"] = 1
        self._assert_capture_result_rejected(
            result,
            r"capture result ids must match all manual podcast references",
        )

    def test_rejects_capture_metadata_mismatch(self):
        result = self._load_committed_result("capture_resampler_latest_results.json")
        result["samples"][0]["language"] = "English"
        self._assert_capture_result_rejected(
            result,
            r"language does not match podcast_samples.json",
        )

    def test_rejects_capture_pipeline_contract_drift(self):
        for key, value, message in (
            ("windowSeconds", 25, "capture accuracy window must remain 20 seconds"),
            ("filterTaps", 127, "capture filter contract is stale"),
            ("inputSampleRate", 44_100, "capture sample-rate contract is stale"),
        ):
            with self.subTest(key=key):
                result = self._load_committed_result(
                    "capture_resampler_latest_results.json"
                )
                result[key] = value
                self._assert_capture_result_rejected(result, message)

    def test_rejects_model_selection_fixture_hash_drift(self):
        result = self._load_committed_result("model_selection_latest_results.json")
        result["fixtureInputs"][0]["audioSha256"] = "0" * 64
        self._assert_model_selection_result_rejected(
            result,
            r"audioSha256 differs from capture benchmark",
        )

    def test_rejects_model_selection_prepared_input_drift(self):
        result = self._load_committed_result("model_selection_latest_results.json")
        result["fixtureInputs"][0]["preparedFloat32Sha256"] = "0" * 64
        self._assert_model_selection_result_rejected(
            result,
            r"prepared input hash is stale",
        )

    def test_rejects_model_selection_worker_hash_drift(self):
        result = self._load_committed_result("model_selection_latest_results.json")
        result["models"][1]["workerSha256"] = "0" * 64
        self._assert_model_selection_result_rejected(
            result,
            r"worker hash differs across model runs",
        )

    def test_rejects_model_selection_weight_hash_drift(self):
        result = self._load_committed_result("model_selection_latest_results.json")
        result["models"][2]["weightSha256"] = "0" * 64
        self._assert_model_selection_result_rejected(
            result,
            r"pinned model metadata is stale",
        )

    def test_rejects_8bit_support_after_material_sample_regression(self):
        result = self._load_committed_result("model_selection_latest_results.json")
        result["models"][1]["decision"]["productionSupported"] = True
        self._assert_model_selection_result_rejected(
            result,
            r"candidate cannot be supported after material sample regression",
        )

    def test_rejects_4bit_support_after_aggregate_regression(self):
        result = self._load_committed_result("model_selection_latest_results.json")
        candidate = result["models"][2]
        row = candidate["samples"][1]
        row["wordEdits"] = 40
        row["wer"] = 40 / result["fixtureInputs"][1]["referenceWords"]
        candidate["summary"]["wordEdits"] = sum(
            sample["wordEdits"] for sample in candidate["samples"]
        )
        candidate["summary"]["pooledWer"] = (
            candidate["summary"]["wordEdits"] / result["referenceWords"]
        )
        candidate["summary"]["macroWer"] = sum(
            sample["wer"] for sample in candidate["samples"]
        ) / len(candidate["samples"])
        candidate["decision"]["productionSupported"] = True
        self._assert_model_selection_result_rejected(
            result,
            r"candidate cannot be supported after aggregate regression",
        )

    def test_rejects_candidate_support_at_unreasonable_rtf_cost(self):
        result = self._load_committed_result("model_selection_latest_results.json")
        baseline = result["models"][0]
        candidate = result["models"][1]
        candidate["samples"] = json.loads(json.dumps(baseline["samples"]))
        for key in (
            "wordEdits",
            "characterEdits",
            "macroWer",
            "pooledWer",
            "macroCer",
            "pooledCer",
        ):
            candidate["summary"][key] = baseline["summary"][key]
        candidate["decision"]["productionSupported"] = True
        self._assert_model_selection_result_rejected(
            result,
            r"candidate cannot be supported at unreasonable RTF cost",
        )

    def test_rejects_bf16_support_without_wer_improvement(self):
        result = self._load_committed_result("model_selection_latest_results.json")
        candidate = result["models"][3]
        candidate["summary"]["pooledRealTimeFactor"] = (
            result["models"][0]["summary"]["pooledRealTimeFactor"]
        )
        candidate["summary"]["totalInferenceSeconds"] = (
            candidate["summary"]["pooledRealTimeFactor"] * result["audioSeconds"]
        )
        candidate["decision"]["productionSupported"] = True
        self._assert_model_selection_result_rejected(
            result,
            r"candidate cannot be supported without pooled and macro WER improvement",
        )

    def test_rejects_model_selection_decision_drift(self):
        result = self._load_committed_result("model_selection_latest_results.json")
        result["decision"]["selectedModelId"] = "qwen3-asr-1.7b-8bit"
        result["decision"]["productionChangeSupported"] = True
        self._assert_model_selection_result_rejected(
            result,
            r"model-selection decision must keep the 0.6B model",
        )

    def test_rejects_combined_mixer_source_hash_drift(self):
        result = self._load_committed_result("combined_mixer_latest_results.json")
        result["sourceAssets"][0]["audioSha256"] = "0" * 64
        self._assert_combined_mixer_result_rejected(
            result,
            r"audioSha256 differs from capture benchmark",
        )

    def test_rejects_activity_mixer_support_after_safety_regressions(self):
        result = self._load_committed_result("combined_mixer_latest_results.json")
        result["activityAware"]["productionChangeSupported"] = True
        self._assert_combined_mixer_result_rejected(
            result,
            r"activity-aware mixer cannot be supported with HVAC or independent-speech regression",
        )

    def test_rejects_stale_activity_mixer_regression_evidence(self):
        result = self._load_committed_result("combined_mixer_latest_results.json")
        hvac = next(
            row
            for row in result["activityAware"]["results"]
            if row["condition"] == "hvacNoiseMinus38Dbfs"
        )
        hvac["candidateWordEdits"] = hvac["currentWordEdits"]
        self._assert_combined_mixer_result_rejected(
            result,
            r"activity-aware word-edit evidence is stale",
        )

    def test_rejects_echo_suppression_support_after_local_speech_failure(self):
        result = self._load_committed_result("combined_mixer_latest_results.json")
        result["echoSuppression"]["productionChangeSupported"] = True
        self._assert_combined_mixer_result_rejected(
            result,
            r"echo suppression cannot be supported after local-speech safety failure",
        )

    def test_rejects_stale_echo_local_speech_safety_counts(self):
        result = self._load_committed_result("combined_mixer_latest_results.json")
        result["echoSuppression"]["safety"][
            "localSpeechDetectedAsEchoBlocks"
        ] = 0
        self._assert_combined_mixer_result_rejected(
            result,
            r"echo local-speech safety evidence is stale",
        )

    def test_rejects_system_unity_support_from_weak_gain(self):
        result = self._load_committed_result("combined_mixer_latest_results.json")
        result["alternatingSourceGain"]["productionChangeSupported"] = True
        self._assert_combined_mixer_result_rejected(
            result,
            r"system-unity gain cannot be supported by the weak alternating-source result",
        )

    def test_rejects_combined_mixer_top_level_decision_drift(self):
        result = self._load_committed_result("combined_mixer_latest_results.json")
        result["decision"]["selectedMixer"] = "system-unity"
        result["decision"]["productionChangeSupported"] = True
        self._assert_combined_mixer_result_rejected(
            result,
            r"combined mixer decision must keep the current mixer",
        )

    def test_rejects_diarization_fixture_or_speaker_count_drift(self):
        result = self._load_committed_result("diarization_latest_results.json")
        result["voxConverse"]["samples"][0]["currentSpeakerCount"] = 3
        self._assert_diarization_result_rejected(
            result,
            r"current speaker count differs from reference",
        )

    def test_rejects_diarization_quality_regressions(self):
        for key, message in (("microDer", "DER"), ("macroJer", "JER")):
            with self.subTest(metric=key):
                result = self._load_committed_result("diarization_latest_results.json")
                result["voxConverse"]["current"][key] = 0.9
                self._assert_diarization_result_rejected(
                    result,
                    rf"current {message} is worse than atomic baseline",
                )

    def test_rejects_diarization_error_breakdown_drift(self):
        result = self._load_committed_result("diarization_latest_results.json")
        result["voxConverse"]["current"]["confusion"] += 0.001
        self._assert_diarization_result_rejected(
            result,
            r"current DER does not equal miss \+ false alarm \+ confusion",
        )

    def test_rejects_speaker_loss_after_silence_padding(self):
        result = self._load_committed_result("diarization_latest_results.json")
        result["silencePaddingInvariant"]["samples"][1][
            "paddedSpeakerCounts"
        ][1] = 1
        self._assert_diarization_result_rejected(
            result,
            r"trailing silence changes speaker count",
        )

    def test_rejects_long_meeting_speaker_attribution_regression(self):
        result = self._load_committed_result("diarization_latest_results.json")
        current = result["longMeetingAttribution"]["currentSentenceAllocation"]
        current["errors"] = 50
        current["errorRate"] = 50 / result["longMeetingAttribution"]["canonicalWords"]
        result["longMeetingAttribution"]["samples"][-1]["currentErrors"] += 1
        self._assert_diarization_result_rejected(
            result,
            r"long-meeting speaker attribution exceeds verified ceiling",
        )

    def test_rejects_lossy_long_meeting_speaker_allocation(self):
        result = self._load_committed_result("diarization_latest_results.json")
        result["longMeetingAttribution"]["currentSentenceAllocation"][
            "canonicalTextExact"
        ] = False
        self._assert_diarization_result_rejected(
            result,
            r"long-meeting allocation is not lossless and bounded",
        )

    def test_rejects_podcast_diarization_false_positive(self):
        result = self._load_committed_result("diarization_latest_results.json")
        result["podcastFalsePositiveControls"]["samples"][0]["addedSpeakers"] = [2]
        self._assert_diarization_result_rejected(
            result,
            r"podcast control added a speaker",
        )

    def test_rejects_podcast_diarization_turn_drift(self):
        result = self._load_committed_result("diarization_latest_results.json")
        result["podcastFalsePositiveControls"]["samples"][0]["currentTurnCount"] += 1
        self._assert_diarization_result_rejected(
            result,
            r"podcast control differs from atomic baseline",
        )


if __name__ == "__main__":
    unittest.main()
