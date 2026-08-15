#!/usr/bin/env python3
"""Validate committed benchmark manifests and aggregate results without media."""

from __future__ import annotations

import argparse
import hashlib
import json
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


REFERENCE_QUALITIES = {"manual", "automatic-original"}
DIARIZATION_VOX_IDS = ["bkwns", "szsyz", "gwtwd", "syiwe"]
DIARIZATION_PODCAST_IDS = [
    "h7p-xSmMtg4",
    "Ux-TMWnmntM",
    "cSwaRkus1q4",
    "vif8NQcjVf0",
]
MODEL_SELECTION_IDS = [
    "qwen3-asr-0.6b-8bit",
    "qwen3-asr-1.7b-8bit",
    "qwen3-asr-1.7b-4bit",
    "qwen3-asr-0.6b-bf16",
]
MODEL_SELECTION_METADATA = {
    "qwen3-asr-0.6b-8bit": {
        "repo": "mlx-community/Qwen3-ASR-0.6B-8bit",
        "revision": "89e96d92ba34aca20b3e29fb10cc284097d1219f",
        "quantizationBits": 8,
        "weightBytes": 1_006_229_426,
        "weightSha256": "b5bfe4abc1b4c6e58b633096682ec2b6297298add1527119936107d211adf0e8",
    },
    "qwen3-asr-1.7b-8bit": {
        "repo": "mlx-community/Qwen3-ASR-1.7B-8bit",
        "revision": "a8379a2e2f9e313c9292cdf1af4055ab56d50d55",
        "quantizationBits": 8,
        "weightBytes": 2_463_307_541,
        "weightSha256": "bf304b009cc7eca79283056f787b44c952d24ac22cec787b39732bba3c23c13c",
    },
    "qwen3-asr-1.7b-4bit": {
        "repo": "mlx-community/Qwen3-ASR-1.7B-4bit",
        "revision": "78a389c776a5483b2d0d4ea5494e11012e0d6159",
        "quantizationBits": 4,
        "weightBytes": 1_603_081_617,
        "weightSha256": "9848eaf7a5c1589c671b35035ac27b72e248dd0c604eacae547e7e403d29db45",
    },
    "qwen3-asr-0.6b-bf16": {
        "repo": "mlx-community/Qwen3-ASR-0.6B-bf16",
        "revision": "eae2b51f96265328f1e7beced788adb0e4536f92",
        "quantizationBits": 16,
        "weightBytes": 1_564_921_888,
        "weightSha256": "a6e635fd9c8dfd5cdd7465db9bd8c947ab30737b90b83b6b09c304e836bb8a7f",
    },
}
MODEL_SELECTION_WORKER_SHA256 = (
    "d5047ed79036fc5eb6d936bfdeb17a8580d3076b24c2f91fa2b111d7b0ba89ab"
)
MODEL_SELECTION_PREPARED_HASHES = {
    "h7p-xSmMtg4": "7ba4c3a0bc05b52bdd49be661f6786f4cf0b118e44a7468b970673f1f40567c4",
    "Ux-TMWnmntM": "c663f33004df2201302ebe505630c9964934de40bb6c8ff560588e653f001186",
    "cSwaRkus1q4": "438833d967fd09c3995757fa3f39ecc0e4320fa4698f8cd80f99b4e086003eb7",
    "vif8NQcjVf0": "d2d80c10251c6095729e099aa07b61f92dc5f81f0dbd844f16c8d92344a322f6",
}


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"{path}: invalid JSON: {error}") from error


def validate_samples(path: Path) -> list[dict[str, Any]]:
    samples = read_json(path)
    if not isinstance(samples, list) or not samples:
        raise ValueError(f"{path}: expected a non-empty array")
    seen: set[str] = set()
    for index, sample in enumerate(samples):
        label = f"{path}[{index}]"
        if not isinstance(sample, dict):
            raise ValueError(f"{label}: expected an object")
        sample_id = sample.get("id")
        if not isinstance(sample_id, str) or not sample_id:
            raise ValueError(f"{label}: missing id")
        if sample_id in seen:
            raise ValueError(f"{label}: duplicate id {sample_id}")
        seen.add(sample_id)
        parsed = urlparse(str(sample.get("url", "")))
        query_id = parse_qs(parsed.query).get("v", [None])[0]
        if parsed.scheme != "https" or parsed.netloc not in {"youtube.com", "www.youtube.com"} or query_id != sample_id:
            raise ValueError(f"{label}: URL does not identify {sample_id}")
        if sample.get("referenceQuality") not in REFERENCE_QUALITIES:
            raise ValueError(f"{label}: unsupported referenceQuality")
        start = sample.get("startSeconds")
        end = sample.get("endSeconds")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or start < 0 or end <= start:
            raise ValueError(f"{label}: invalid time range")
        subtitle = sample.get("subtitle")
        if not isinstance(subtitle, str) or not subtitle.startswith(f"{sample_id}.") or not subtitle.endswith(".json3"):
            raise ValueError(f"{label}: subtitle must be an id-prefixed JSON3 filename")
    return samples


def metric(value: Any, label: str) -> None:
    if not isinstance(value, (int, float)) or not 0 <= value <= 1:
        raise ValueError(f"{label}: expected a metric between 0 and 1")


def validate_podcast_results(path: Path, samples: list[dict[str, Any]]) -> None:
    result = read_json(path)
    rows = result.get("samples") if isinstance(result, dict) else None
    if not isinstance(rows, list):
        raise ValueError(f"{path}: samples must be an array")
    expected_ids = [sample["id"] for sample in samples]
    actual_ids = [row.get("id") for row in rows if isinstance(row, dict)]
    if actual_ids != expected_ids:
        raise ValueError(f"{path}: result ids do not match podcast_samples.json order")
    if result.get("sampleCount") != len(samples):
        raise ValueError(f"{path}: sampleCount is stale")
    manual_count = sum(sample["referenceQuality"] == "manual" for sample in samples)
    if result.get("manualReferenceCount") != manual_count:
        raise ValueError(f"{path}: manualReferenceCount is stale")
    for sample, row in zip(samples, rows):
        if row.get("referenceQuality") != sample["referenceQuality"]:
            raise ValueError(
                f"{path}:{sample['id']}: referenceQuality does not match podcast_samples.json"
            )
        for key in ("liveCer", "liveWer", "rollingCer", "rollingWer"):
            metric(row.get(key), f"{path}:{row.get('id')}:{key}")

    manual_rows = [
        row
        for sample, row in zip(samples, rows)
        if sample["referenceQuality"] == "manual"
    ]
    aggregate_metrics = {
        "manualLiveMeanCer": "liveCer",
        "manualLiveMeanWer": "liveWer",
        "manualRollingMeanCer": "rollingCer",
        "manualRollingMeanWer": "rollingWer",
    }
    for aggregate_key, row_key in aggregate_metrics.items():
        actual = result.get(aggregate_key)
        metric(actual, f"{path}:{aggregate_key}")
        decimal_values = [Decimal(str(row[row_key])) for row in manual_rows]
        expected = float(round(sum(decimal_values) / len(decimal_values), 4))
        if actual != expected:
            raise ValueError(
                f"{path}:{aggregate_key} is stale; expected {expected} from manual rows"
            )

    for error_rate in ("Cer", "Wer"):
        live = result[f"manualLiveMean{error_rate}"]
        rolling = result[f"manualRollingMean{error_rate}"]
        if rolling > live:
            raise ValueError(
                f"{path}: manual rolling {error_rate.upper()} is worse than live"
            )


def validate_full_video_results(path: Path, samples: list[dict[str, Any]]) -> None:
    result = read_json(path)
    if not isinstance(result, dict) or result.get("id") not in {sample["id"] for sample in samples}:
        raise ValueError(f"{path}: result id is not in full_video_samples.json")
    sample = next(sample for sample in samples if sample["id"] == result["id"])
    expected_audio_seconds = float(sample["endSeconds"]) - float(sample["startSeconds"])
    audio_seconds = result.get("audioSeconds")
    if expected_audio_seconds < 5 * 60 or not isinstance(audio_seconds, (int, float)) or audio_seconds < 5 * 60:
        raise ValueError(f"{path}: full-video benchmark must cover at least five minutes")
    # WAV containers and YouTube timestamps can differ by a fractional second.
    if abs(float(audio_seconds) - expected_audio_seconds) > 1.0:
        raise ValueError(f"{path}: audioSeconds does not match full_video_samples.json")
    for section in ("baseline", "improved"):
        values = result.get(section)
        if not isinstance(values, dict):
            raise ValueError(f"{path}:{section}: expected an object")
        for key in ("cer", "wer", "continuousWer", "groupedCer"):
            metric(values.get(key), f"{path}:{section}:{key}")
    baseline = result["baseline"]
    improved = result["improved"]
    if baseline.get("windowSeconds") != 20 or improved.get("windowSeconds") != 20:
        raise ValueError(f"{path}: full-video accuracy window must remain 20 seconds")
    word_edits = improved.get("continuousWordEdits")
    if not isinstance(word_edits, int) or word_edits < 0:
        raise ValueError(f"{path}: improved continuousWordEdits is invalid")
    screen = result.get("windowScreen")
    if not isinstance(screen, dict):
        raise ValueError(f"{path}: missing full-video window screen")
    if (
        screen.get("candidateWindowSeconds") != 25
        or screen.get("decision") != "keep-20-seconds"
    ):
        raise ValueError(f"{path}: full-video window decision is stale")
    metric(
        screen.get("candidateContinuousWer"),
        f"{path}:windowScreen:candidateContinuousWer",
    )
    metric(
        screen.get("candidateGroupedCer"),
        f"{path}:windowScreen:candidateGroupedCer",
    )
    candidate_word_edits = screen.get("candidateContinuousWordEdits")
    if not isinstance(candidate_word_edits, int) or candidate_word_edits < word_edits:
        raise ValueError(f"{path}: 25-second window rejection is not supported by word edits")
    for key in ("continuousWer", "groupedCer"):
        if improved[key] > baseline[key]:
            raise ValueError(f"{path}: improved {key} is worse than baseline")
    numeral = result.get("koreanNumeralFormatting")
    if not isinstance(numeral, dict):
        raise ValueError(f"{path}: missing Korean numeral formatting screen")
    metric(
        numeral.get("candidateContinuousWer"),
        f"{path}:koreanNumeralFormatting:candidateContinuousWer",
    )
    metric(
        numeral.get("candidateGroupedCer"),
        f"{path}:koreanNumeralFormatting:candidateGroupedCer",
    )
    for key in (
        "formattedOccurrences",
        "changedWindows",
        "baselineContinuousWordEdits",
        "candidateContinuousWordEdits",
        "baselineGroupedCharacterEdits",
        "candidateGroupedCharacterEdits",
    ):
        if not isinstance(numeral.get(key), int) or numeral[key] < 0:
            raise ValueError(f"{path}: Korean numeral {key} is invalid")
    if (
        numeral["candidateContinuousWordEdits"]
        >= numeral["baselineContinuousWordEdits"]
        or numeral["candidateGroupedCharacterEdits"]
        >= numeral["baselineGroupedCharacterEdits"]
        or numeral.get("manualPodcastWordEditDelta") != 0
        or numeral.get("semanticFalsePositives") != 0
    ):
        raise ValueError(f"{path}: Korean numeral formatting quality gate failed")
    replay = result.get("productionWorkerReplay")
    if not isinstance(replay, dict):
        raise ValueError(f"{path}: missing productionWorkerReplay")
    processed_seconds = replay.get("processedAudioSeconds")
    if (
        not isinstance(processed_seconds, (int, float))
        or abs(processed_seconds - audio_seconds) > 0.01
    ):
        raise ValueError(f"{path}: production replay did not process the full audio")
    metric(replay.get("continuousWer"), f"{path}:productionWorkerReplay:continuousWer")
    metric(
        replay.get("documentContinuousWer"),
        f"{path}:productionWorkerReplay:documentContinuousWer",
    )
    for key in ("continuousWordEdits", "documentWordEdits"):
        if not isinstance(replay.get(key), int) or replay[key] < 0:
            raise ValueError(f"{path}: productionWorkerReplay {key} is invalid")
    if Decimal(str(replay["continuousWer"])) > (
        Decimal(str(improved["continuousWer"])) + Decimal("0.01")
    ):
        raise ValueError(
            f"{path}: productionWorkerReplay continuousWer is more than 0.01 worse than improved"
        )
    if replay.get("captionedSpeechAfterLastTranscript") is not False:
        raise ValueError(f"{path}: production replay does not cover the captioned ending")
    if replay.get("documentMatchesFinalText") is not True:
        raise ValueError(
            f"{path}: production replay document segments do not preserve the final text"
        )
    if replay["documentContinuousWer"] != replay["continuousWer"]:
        raise ValueError(
            f"{path}: production replay document WER differs from final text WER"
        )
    if replay["documentWordEdits"] != replay["continuousWordEdits"]:
        raise ValueError(
            f"{path}: production replay document word edits differ from final text"
        )
    if (
        replay["continuousWordEdits"]
        != numeral["candidateContinuousWordEdits"]
        or replay["continuousWer"] != numeral["candidateContinuousWer"]
    ):
        raise ValueError(
            f"{path}: production replay does not include the validated numeral formatting"
        )


def validate_capture_resampler_results(
    path: Path,
    samples: list[dict[str, Any]],
) -> None:
    result = read_json(path)
    rows = result.get("samples") if isinstance(result, dict) else None
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{path}: samples must be a non-empty array")
    if result.get("windowSeconds") != 20:
        raise ValueError(f"{path}: capture accuracy window must remain 20 seconds")
    if result.get("inputSampleRate") != 48_000 or result.get("outputSampleRate") != 16_000:
        raise ValueError(f"{path}: capture sample-rate contract is stale")
    if result.get("filterTaps") != 255 or result.get("cutoffGuard") != 0.9:
        raise ValueError(f"{path}: capture filter contract is stale")
    manifest = {sample["id"]: sample for sample in samples}
    actual_ids = [row.get("id") for row in rows if isinstance(row, dict)]
    if len(actual_ids) != len(rows) or len(set(actual_ids)) != len(actual_ids):
        raise ValueError(f"{path}: capture result ids must be unique")
    if any(sample_id not in manifest for sample_id in actual_ids):
        raise ValueError(f"{path}: capture result id is not in podcast_samples.json")
    expected_ids = [
        sample["id"]
        for sample in samples
        if sample["referenceQuality"] == "manual"
    ]
    if actual_ids != expected_ids:
        raise ValueError(
            f"{path}: capture result ids must match all manual podcast references"
        )
    if result.get("sampleCount") != len(rows):
        raise ValueError(f"{path}: sampleCount is stale")
    manual_count = sum(manifest[row["id"]]["referenceQuality"] == "manual" for row in rows)
    if result.get("manualReferenceCount") != manual_count:
        raise ValueError(f"{path}: manualReferenceCount is stale")
    for row in rows:
        sample = manifest[row["id"]]
        if row.get("referenceQuality") != sample["referenceQuality"]:
            raise ValueError(
                f"{path}:{row['id']}: referenceQuality does not match podcast_samples.json"
            )
        for key in ("title", "language"):
            if row.get(key) != sample.get(key):
                raise ValueError(
                    f"{path}:{row['id']}: {key} does not match podcast_samples.json"
                )
        for key in (
            "legacyCer",
            "legacyWer",
            "antiAliasedCer",
            "antiAliasedWer",
            "transparentSystemCer",
            "transparentSystemWer",
        ):
            metric(row.get(key), f"{path}:{row['id']}:{key}")

    # Capture preparation is accepted on the complete manual set. Individual
    # clips can move by one edit under deterministic greedy decoding, while a
    # per-row monotonic rule would overfit the four fixtures and block genuine
    # aggregate improvements.
    for suffix in ("Cer", "Wer"):
        if sum(Decimal(str(row[f"antiAliased{suffix}"])) for row in rows) > sum(
            Decimal(str(row[f"legacy{suffix}"])) for row in rows
        ):
            raise ValueError(
                f"{path}: anti-aliased mean {suffix.upper()} is worse than legacy"
            )
        if sum(Decimal(str(row[f"transparentSystem{suffix}"])) for row in rows) > sum(
            Decimal(str(row[f"antiAliased{suffix}"])) for row in rows
        ):
            raise ValueError(
                f"{path}: transparent system mean {suffix.upper()} is worse than anti-aliased"
            )

    trusted = [row for row in rows if row["referenceQuality"] == "manual"] or rows
    aggregate_metrics = {
        "legacyMeanCer": "legacyCer",
        "legacyMeanWer": "legacyWer",
        "antiAliasedMeanCer": "antiAliasedCer",
        "antiAliasedMeanWer": "antiAliasedWer",
        "transparentSystemMeanCer": "transparentSystemCer",
        "transparentSystemMeanWer": "transparentSystemWer",
    }
    for aggregate_key, row_key in aggregate_metrics.items():
        actual = result.get(aggregate_key)
        metric(actual, f"{path}:{aggregate_key}")
        expected = float(round(
            sum(Decimal(str(row[row_key])) for row in trusted) / len(trusted),
            4,
        ))
        if actual != expected:
            raise ValueError(f"{path}:{aggregate_key} is stale; expected {expected}")


def validate_model_selection_results(
    path: Path,
    samples: list[dict[str, Any]],
    capture_result: dict[str, Any] | None = None,
) -> None:
    result = read_json(path)
    if not isinstance(result, dict):
        raise ValueError(f"{path}: expected an object")
    if capture_result is None:
        loaded_capture = read_json(path.with_name("capture_resampler_latest_results.json"))
        capture_result = loaded_capture if isinstance(loaded_capture, dict) else {}
    if result.get("committedMediaOrTranscripts") is not False:
        raise ValueError(f"{path}: model selection must not commit media or transcripts")

    expected_capture_path = {
        "inputSampleRate": 48_000,
        "outputSampleRate": 16_000,
        "filterTaps": 255,
        "cutoffGuard": 0.9,
        "mixer": "clip(system, -1, 1)",
        "windowSeconds": 20,
        "meetingContext": "",
        "cleanup": "transcribe_meeting_audio + sanitize_stream_text",
    }
    if result.get("capturePath") != expected_capture_path:
        raise ValueError(f"{path}: model-selection capture path is stale")

    gate = result.get("selectionGate")
    expected_gate = {
        "materialWordEditRegression": 5,
        "materialAbsoluteWerRegression": 0.02,
        "maximumCandidateRtfRatio": 1.5,
        "requireAggregateNonRegression": True,
        "requireNoMaterialSampleRegression": True,
        "requirePooledAndMacroWerImprovement": True,
    }
    if gate != expected_gate:
        raise ValueError(f"{path}: model-selection gate is stale")

    manifest = {sample["id"]: sample for sample in samples}
    expected_ids = [
        sample["id"] for sample in samples if sample["referenceQuality"] == "manual"
    ]
    fixtures = result.get("fixtureInputs")
    if (
        not isinstance(fixtures, list)
        or result.get("sampleCount") != len(fixtures)
        or [row.get("id") for row in fixtures if isinstance(row, dict)] != expected_ids
    ):
        raise ValueError(f"{path}: model-selection fixture ids are stale")
    capture_rows = capture_result.get("samples")
    if not isinstance(capture_rows, list):
        raise ValueError(f"{path}: capture benchmark samples are unavailable")
    capture_by_id = {
        row.get("id"): row for row in capture_rows if isinstance(row, dict)
    }
    for fixture in fixtures:
        sample_id = fixture["id"]
        sample = manifest[sample_id]
        capture = capture_by_id.get(sample_id)
        if not isinstance(capture, dict):
            raise ValueError(f"{path}:{sample_id}: missing capture fixture")
        if fixture.get("language") != sample.get("language"):
            raise ValueError(f"{path}:{sample_id}: fixture language differs from manifest")
        for key in ("audioSha256", "subtitleSha256"):
            if fixture.get(key) != capture.get(key):
                raise ValueError(
                    f"{path}:{sample_id}: {key} differs from capture benchmark"
                )
        if fixture.get("preparedFloat32Sha256") != MODEL_SELECTION_PREPARED_HASHES[sample_id]:
            raise ValueError(f"{path}:{sample_id}: prepared input hash is stale")
        for key in ("referenceWords", "referenceCharacters"):
            if not isinstance(fixture.get(key), int) or fixture[key] <= 0:
                raise ValueError(f"{path}:{sample_id}: {key} is invalid")
        if not isinstance(fixture.get("audioSeconds"), (int, float)) or abs(
            fixture["audioSeconds"] - capture["audioSeconds"]
        ) > 0.001:
            raise ValueError(f"{path}:{sample_id}: audioSeconds differs from capture benchmark")

    input_fingerprint_source = "\n".join(
        f"{fixture['id']}:{fixture['preparedFloat32Sha256']}" for fixture in fixtures
    )
    expected_input_fingerprint = hashlib.sha256(
        input_fingerprint_source.encode("utf-8")
    ).hexdigest()
    if result.get("preparedInputSetSha256") != expected_input_fingerprint:
        raise ValueError(f"{path}: prepared input-set hash is stale")

    reference_words = sum(fixture["referenceWords"] for fixture in fixtures)
    reference_characters = sum(fixture["referenceCharacters"] for fixture in fixtures)
    audio_seconds = sum(Decimal(str(fixture["audioSeconds"])) for fixture in fixtures)
    if (
        result.get("referenceWords") != reference_words
        or result.get("referenceCharacters") != reference_characters
        or Decimal(str(result.get("audioSeconds"))) != audio_seconds
    ):
        raise ValueError(f"{path}: model-selection fixture totals are stale")

    models = result.get("models")
    if (
        not isinstance(models, list)
        or [model.get("id") for model in models if isinstance(model, dict)]
        != MODEL_SELECTION_IDS
    ):
        raise ValueError(f"{path}: model-selection model ids are stale")
    baseline = models[0]
    baseline_samples: dict[str, dict[str, Any]] = {}
    for model in models:
        model_id = model["id"]
        metadata = MODEL_SELECTION_METADATA[model_id]
        if any(model.get(key) != value for key, value in metadata.items()):
            raise ValueError(f"{path}:{model_id}: pinned model metadata is stale")
        if model.get("workerSha256") != MODEL_SELECTION_WORKER_SHA256:
            raise ValueError(f"{path}:{model_id}: worker hash differs across model runs")
        if model.get("preparedInputSetSha256") != expected_input_fingerprint:
            raise ValueError(f"{path}:{model_id}: prepared inputs differ across model runs")
        rows = model.get("samples")
        if (
            not isinstance(rows, list)
            or [row.get("id") for row in rows if isinstance(row, dict)] != expected_ids
        ):
            raise ValueError(f"{path}:{model_id}: sample ids are stale")

        word_edits = 0
        character_edits = 0
        word_rates: list[Decimal] = []
        character_rates: list[Decimal] = []
        for fixture, row in zip(fixtures, rows):
            for key in ("wordEdits", "characterEdits"):
                if not isinstance(row.get(key), int) or row[key] < 0:
                    raise ValueError(f"{path}:{model_id}:{row.get('id')}:{key} is invalid")
            metric(row.get("wer"), f"{path}:{model_id}:{row.get('id')}:wer")
            metric(row.get("cer"), f"{path}:{model_id}:{row.get('id')}:cer")
            if not isinstance(row.get("realTimeFactor"), (int, float)) or row["realTimeFactor"] <= 0:
                raise ValueError(f"{path}:{model_id}:{row.get('id')}: RTF is invalid")
            expected_wer = Decimal(row["wordEdits"]) / Decimal(fixture["referenceWords"])
            expected_cer = Decimal(row["characterEdits"]) / Decimal(
                fixture["referenceCharacters"]
            )
            if abs(Decimal(str(row["wer"])) - expected_wer) > Decimal("1e-15"):
                raise ValueError(f"{path}:{model_id}:{row['id']}: WER is stale")
            if abs(Decimal(str(row["cer"])) - expected_cer) > Decimal("1e-15"):
                raise ValueError(f"{path}:{model_id}:{row['id']}: CER is stale")
            word_edits += row["wordEdits"]
            character_edits += row["characterEdits"]
            word_rates.append(expected_wer)
            character_rates.append(expected_cer)
            if model_id == MODEL_SELECTION_IDS[0]:
                baseline_samples[row["id"]] = row

        summary = model.get("summary")
        if not isinstance(summary, dict):
            raise ValueError(f"{path}:{model_id}: summary is missing")
        if (
            summary.get("wordEdits") != word_edits
            or summary.get("characterEdits") != character_edits
        ):
            raise ValueError(f"{path}:{model_id}: aggregate edit counts are stale")
        expected_rates = {
            "macroWer": sum(word_rates) / len(word_rates),
            "pooledWer": Decimal(word_edits) / Decimal(reference_words),
            "macroCer": sum(character_rates) / len(character_rates),
            "pooledCer": Decimal(character_edits) / Decimal(reference_characters),
        }
        for key, expected in expected_rates.items():
            metric(summary.get(key), f"{path}:{model_id}:{key}")
            if abs(Decimal(str(summary[key])) - expected) > Decimal("1e-15"):
                raise ValueError(f"{path}:{model_id}: {key} is stale")
        inference_seconds = summary.get("totalInferenceSeconds")
        if not isinstance(inference_seconds, (int, float)) or inference_seconds <= 0:
            raise ValueError(f"{path}:{model_id}: inference time is invalid")
        expected_rtf = Decimal(str(inference_seconds)) / audio_seconds
        if (
            not isinstance(summary.get("pooledRealTimeFactor"), (int, float))
            or abs(Decimal(str(summary["pooledRealTimeFactor"])) - expected_rtf)
            > Decimal("1e-15")
        ):
            raise ValueError(f"{path}:{model_id}: pooled RTF is stale")
        for key in (
            "mlxPeakMemoryBytes",
            "mlxActiveMemoryBytes",
            "processPeakRssBytes",
            "osPeakMemoryFootprintBytes",
        ):
            if not isinstance(summary.get(key), int) or summary[key] <= 0:
                raise ValueError(f"{path}:{model_id}: {key} is invalid")
        if summary["mlxActiveMemoryBytes"] > summary["mlxPeakMemoryBytes"]:
            raise ValueError(f"{path}:{model_id}: active MLX memory exceeds peak")

        decision = model.get("decision")
        if not isinstance(decision, dict):
            raise ValueError(f"{path}:{model_id}: decision is missing")
        if model_id == MODEL_SELECTION_IDS[0]:
            if (
                decision.get("productionSupported") is not True
                or decision.get("fullVideoBenchmarkStarted") is not True
            ):
                raise ValueError(f"{path}: current production model support is stale")
            continue

        material_regression = any(
            row["wordEdits"] - baseline_samples[row["id"]]["wordEdits"]
            >= gate["materialWordEditRegression"]
            and Decimal(str(row["wer"]))
            - Decimal(str(baseline_samples[row["id"]]["wer"]))
            >= Decimal(str(gate["materialAbsoluteWerRegression"]))
            for row in rows
        )
        aggregate_regression = (
            Decimal(str(summary["pooledWer"]))
            > Decimal(str(baseline["summary"]["pooledWer"]))
            or Decimal(str(summary["pooledCer"]))
            > Decimal(str(baseline["summary"]["pooledCer"]))
        )
        unreasonable_cost = (
            Decimal(str(summary["pooledRealTimeFactor"]))
            / Decimal(str(baseline["summary"]["pooledRealTimeFactor"]))
            > Decimal(str(gate["maximumCandidateRtfRatio"]))
        )
        insufficient_wer_gain = (
            Decimal(str(summary["pooledWer"]))
            >= Decimal(str(baseline["summary"]["pooledWer"]))
            or Decimal(str(summary["macroWer"]))
            >= Decimal(str(baseline["summary"]["macroWer"]))
        )
        if decision.get("productionSupported") is True:
            if material_regression:
                raise ValueError(
                    f"{path}:{model_id}: candidate cannot be supported after material sample regression"
                )
            if aggregate_regression:
                raise ValueError(
                    f"{path}:{model_id}: candidate cannot be supported after aggregate regression"
                )
            if unreasonable_cost:
                raise ValueError(
                    f"{path}:{model_id}: candidate cannot be supported at unreasonable RTF cost"
                )
            if insufficient_wer_gain:
                raise ValueError(
                    f"{path}:{model_id}: candidate cannot be supported without pooled and macro WER improvement"
                )
        if (
            decision.get("productionSupported") is not False
            or decision.get("fullVideoBenchmarkStarted") is not False
            or not (
                material_regression
                or aggregate_regression
                or unreasonable_cost
                or insufficient_wer_gain
            )
        ):
            raise ValueError(f"{path}:{model_id}: candidate rejection evidence is stale")

    if (
        capture_result.get("model") != baseline.get("repo")
        or capture_result.get("modelRevision") != baseline.get("revision")
    ):
        raise ValueError(f"{path}: selected model differs from capture benchmark")
    final_decision = result.get("decision")
    if (
        not isinstance(final_decision, dict)
        or final_decision.get("selectedModelId") != MODEL_SELECTION_IDS[0]
        or final_decision.get("productionChangeSupported") is not False
    ):
        raise ValueError(f"{path}: model-selection decision must keep the 0.6B model")


def validate_combined_mixer_results(
    path: Path,
    samples: list[dict[str, Any]],
    capture_result: dict[str, Any] | None = None,
) -> None:
    result = read_json(path)
    if not isinstance(result, dict):
        raise ValueError(f"{path}: expected an object")
    if capture_result is None:
        loaded_capture = read_json(path.with_name("capture_resampler_latest_results.json"))
        capture_result = loaded_capture if isinstance(loaded_capture, dict) else {}

    if (
        result.get("inputSampleRate") != 48_000
        or result.get("outputSampleRate") != 16_000
        or result.get("windowSeconds") != 20
    ):
        raise ValueError(f"{path}: combined mixer sample-rate/window contract is stale")
    if result.get("filterTaps") != 255 or result.get("cutoffGuard") != 0.9:
        raise ValueError(f"{path}: combined mixer resampler contract is stale")
    if (
        result.get("model") != capture_result.get("model")
        or result.get("modelRevision") != capture_result.get("modelRevision")
    ):
        raise ValueError(f"{path}: combined mixer model revision differs from capture benchmark")
    if result.get("committedMediaOrTranscripts") is not False:
        raise ValueError(f"{path}: combined mixer evidence must not commit media or transcripts")
    if result.get("currentMixer") != "tanh(0.65 * system + 0.82 * microphone)":
        raise ValueError(f"{path}: current combined mixer equation is stale")

    decision = result.get("decision")
    if (
        not isinstance(decision, dict)
        or decision.get("selectedMixer") != "current"
        or decision.get("productionChangeSupported") is not False
    ):
        raise ValueError(f"{path}: combined mixer decision must keep the current mixer")

    manifest = {sample["id"]: sample for sample in samples}
    expected_ids = [
        sample["id"] for sample in samples if sample["referenceQuality"] == "manual"
    ]
    assets = result.get("sourceAssets")
    if (
        not isinstance(assets, list)
        or result.get("sampleCount") != len(assets)
        or [asset.get("id") for asset in assets if isinstance(asset, dict)]
        != expected_ids
    ):
        raise ValueError(f"{path}: combined mixer source ids are stale")
    capture_rows = capture_result.get("samples")
    if not isinstance(capture_rows, list):
        raise ValueError(f"{path}: capture benchmark samples are unavailable")
    capture_by_id = {
        row.get("id"): row for row in capture_rows if isinstance(row, dict)
    }
    for asset in assets:
        sample_id = asset["id"]
        sample = manifest[sample_id]
        capture = capture_by_id.get(sample_id)
        if not isinstance(capture, dict):
            raise ValueError(f"{path}:{sample_id}: source is missing from capture benchmark")
        for key in ("title", "language", "referenceQuality"):
            if asset.get(key) != sample.get(key):
                raise ValueError(
                    f"{path}:{sample_id}: {key} does not match podcast_samples.json"
                )
        for key in ("audioSeconds", "audioSha256", "subtitleSha256"):
            if asset.get(key) != capture.get(key):
                raise ValueError(
                    f"{path}:{sample_id}: {key} differs from capture benchmark"
                )
        expected_seed = int(
            hashlib.sha256(sample_id.encode("utf-8")).hexdigest()[:8], 16
        )
        if asset.get("noiseSeed") != expected_seed:
            raise ValueError(f"{path}:{sample_id}: deterministic noise seed is stale")
    total_seconds = sum(Decimal(str(asset["audioSeconds"])) for asset in assets)
    if (
        Decimal(str(result.get("audioSeconds"))) != total_seconds
        or result.get("audioSeconds") != capture_result.get("audioSeconds")
    ):
        raise ValueError(f"{path}: combined mixer audioSeconds is stale")

    expected_conditions = {
        "silentMic",
        "deviceNoiseMinus50Dbfs",
        "hvacNoiseMinus38Dbfs",
        "independentSpeechMinus10Db",
        "microphoneOnly",
        "echo120msMinus14Db",
        "roomEchoMultitapNonlinear",
        "echoPlusLocalSpeechMinus14Db",
        "echoPlusQuietLocalSpeechMinus24Db",
    }
    conditions = result.get("conditions")
    if (
        not isinstance(conditions, dict)
        or set(conditions) != expected_conditions
        or any(not isinstance(value, str) or not value for value in conditions.values())
    ):
        raise ValueError(f"{path}: combined mixer conditions are stale")
    generator = result.get("conditionGenerator")
    if (
        not isinstance(generator, dict)
        or set(generator)
        != {"noiseSeed", "coloredNoise", "independentSpeech", "sourceOrder"}
        or any(not isinstance(value, str) or not value for value in generator.values())
    ):
        raise ValueError(f"{path}: combined mixer condition generator is stale")

    activity = result.get("activityAware")
    activity_rows = activity.get("results") if isinstance(activity, dict) else None
    expected_activity_conditions = [
        "silentMic",
        "deviceNoiseMinus50Dbfs",
        "hvacNoiseMinus38Dbfs",
        "independentSpeechMinus10Db",
        "microphoneOnly",
    ]
    if (
        not isinstance(activity_rows, list)
        or [row.get("condition") for row in activity_rows if isinstance(row, dict)]
        != expected_activity_conditions
    ):
        raise ValueError(f"{path}: activity-aware evidence is stale")
    expected_activity_edits = {
        "silentMic": (158, 155),
        "deviceNoiseMinus50Dbfs": (157, 155),
        "hvacNoiseMinus38Dbfs": (158, 173),
        "independentSpeechMinus10Db": (319, 325),
        "microphoneOnly": (156, 155),
    }
    activity_by_condition: dict[str, dict[str, Any]] = {}
    for row in activity_rows:
        condition = row["condition"]
        activity_by_condition[condition] = row
        for key in (
            "currentMacroWer",
            "candidateMacroWer",
            "currentMacroCer",
            "candidateMacroCer",
        ):
            metric(row.get(key), f"{path}:activityAware:{condition}:{key}")
        edits = (row.get("currentWordEdits"), row.get("candidateWordEdits"))
        if edits != expected_activity_edits[condition]:
            raise ValueError(f"{path}: activity-aware word-edit evidence is stale")
    hvac = activity_by_condition["hvacNoiseMinus38Dbfs"]
    independent = activity_by_condition["independentSpeechMinus10Db"]
    activity_regresses = (
        hvac["candidateWordEdits"] > hvac["currentWordEdits"]
        and hvac["candidateMacroWer"] > hvac["currentMacroWer"]
        and independent["candidateWordEdits"] > independent["currentWordEdits"]
        and independent["candidateMacroWer"] > independent["currentMacroWer"]
    )
    if activity.get("productionChangeSupported") is not False:
        if activity_regresses:
            raise ValueError(
                f"{path}: activity-aware mixer cannot be supported with HVAC or independent-speech regression"
            )
        raise ValueError(f"{path}: activity-aware support decision is stale")
    if activity.get("decision") != "rejected" or not activity_regresses:
        raise ValueError(f"{path}: activity-aware rejection evidence is stale")

    echo = result.get("echoSuppression")
    simple_echo = echo.get("simpleEcho") if isinstance(echo, dict) else None
    safety = echo.get("safety") if isinstance(echo, dict) else None
    detector = echo.get("detector") if isinstance(echo, dict) else None
    expected_detector = {
        "blockSeconds": 1.0,
        "lagSearchMilliseconds": [40, 250],
        "lagStepMilliseconds": 10,
        "minimumNormalizedCorrelation": 0.82,
        "leastSquaresGainRange": [0.02, 0.6],
        "maximumResidualRmsRatio": 0.55,
    }
    if (
        not isinstance(simple_echo, dict)
        or not isinstance(safety, dict)
        or detector != expected_detector
    ):
        raise ValueError(f"{path}: echo-suppression evidence is missing")
    for key in (
        "currentMacroWer",
        "candidateMacroWer",
        "currentMacroCer",
        "candidateMacroCer",
    ):
        metric(simple_echo.get(key), f"{path}:echoSuppression:{key}")
    expected_echo_counts = {
        "detectedBlocks": 440,
        "totalBlocks": 480,
        "currentWordEdits": 170,
        "candidateWordEdits": 155,
        "currentCharacterEdits": 268,
        "candidateCharacterEdits": 228,
    }
    if any(simple_echo.get(key) != value for key, value in expected_echo_counts.items()):
        raise ValueError(f"{path}: simple-echo improvement evidence is stale")
    if not (
        simple_echo["candidateWordEdits"] < simple_echo["currentWordEdits"]
        and simple_echo["candidateCharacterEdits"]
        < simple_echo["currentCharacterEdits"]
    ):
        raise ValueError(f"{path}: simple-echo candidate did not improve")
    expected_safety_counts = {
        "nonEchoControlDetectedBlocks": 0,
        "nonEchoControlTotalBlocks": 2400,
        "roomEchoMultitapDetectedBlocks": 1,
        "roomEchoMultitapTotalBlocks": 480,
        "localSpeechDetectedAsEchoBlocks": 110,
        "localSpeechTotalBlocks": 480,
        "quietLocalSpeechDetectedAsEchoBlocks": 412,
        "quietLocalSpeechTotalBlocks": 480,
    }
    if any(safety.get(key) != value for key, value in expected_safety_counts.items()):
        raise ValueError(f"{path}: echo local-speech safety evidence is stale")
    local_speech_failure = (
        safety.get("localSpeechPreserved") is False
        and safety["localSpeechDetectedAsEchoBlocks"] > 0
        and safety["quietLocalSpeechDetectedAsEchoBlocks"] > 0
    )
    if echo.get("productionChangeSupported") is not False:
        if local_speech_failure:
            raise ValueError(
                f"{path}: echo suppression cannot be supported after local-speech safety failure"
            )
        raise ValueError(f"{path}: echo-suppression support decision is stale")
    if echo.get("decision") != "rejected" or not local_speech_failure:
        raise ValueError(f"{path}: echo-suppression rejection evidence is stale")

    gain = result.get("alternatingSourceGain")
    current = gain.get("current") if isinstance(gain, dict) else None
    system_unity = gain.get("systemUnity") if isinstance(gain, dict) else None
    if not isinstance(current, dict) or not isinstance(system_unity, dict):
        raise ValueError(f"{path}: alternating-source gain evidence is missing")
    if (
        gain.get("fixtureCount") != 3
        or gain.get("referenceWords") != 671
        or gain.get("referenceCharacters") != 1894
        or current.get("wordEdits") != 232
        or current.get("characterEdits") != 463
        or system_unity.get("wordEdits") != 229
        or system_unity.get("characterEdits") != 459
    ):
        raise ValueError(f"{path}: alternating-source gain counts are stale")
    for section_name, section in (("current", current), ("systemUnity", system_unity)):
        for suffix, edits_key, reference_key in (
            ("Wer", "wordEdits", "referenceWords"),
            ("Cer", "characterEdits", "referenceCharacters"),
        ):
            key = f"micro{suffix}"
            metric(section.get(key), f"{path}:alternatingSourceGain:{section_name}:{key}")
            expected_rate = float(
                round(
                    Decimal(section[edits_key]) / Decimal(gain[reference_key]),
                    6,
                )
            )
            if section[key] != expected_rate:
                raise ValueError(f"{path}: alternating-source {section_name} rate is stale")
    reduction = current["wordEdits"] - system_unity["wordEdits"]
    weak_gain = (
        gain.get("wordEditReduction") == reduction
        and reduction < gain.get("minimumSupportWordEditReduction", 0)
        and gain.get("improvedFixtureCount", 0)
        < gain.get("minimumSupportImprovedFixtureCount", 0)
        and gain.get("simultaneousLocalAndSystemSpeechValidated") is False
    )
    if gain.get("productionChangeSupported") is not False:
        if weak_gain:
            raise ValueError(
                f"{path}: system-unity gain cannot be supported by the weak alternating-source result"
            )
        raise ValueError(f"{path}: system-unity support decision is stale")
    if gain.get("decision") != "insufficient-evidence" or not weak_gain:
        raise ValueError(f"{path}: system-unity insufficient-evidence decision is stale")


def validate_diarization_results(path: Path) -> None:
    result = read_json(path)
    if not isinstance(result, dict):
        raise ValueError(f"{path}: expected an object")
    model = result.get("model")
    revision = result.get("modelRevision")
    if not isinstance(model, str) or not model or not isinstance(revision, str) or len(revision) != 40:
        raise ValueError(f"{path}: missing pinned diarization model revision")

    vox = result.get("voxConverse")
    rows = vox.get("samples") if isinstance(vox, dict) else None
    if not isinstance(rows, list) or vox.get("sampleCount") != len(DIARIZATION_VOX_IDS):
        raise ValueError(f"{path}: VoxConverse sampleCount is stale")
    if [row.get("id") for row in rows if isinstance(row, dict)] != DIARIZATION_VOX_IDS:
        raise ValueError(f"{path}: VoxConverse fixture ids are stale")
    for row in rows:
        reference = row.get("referenceSpeakerCount")
        current = row.get("currentSpeakerCount")
        if not isinstance(reference, int) or reference < 1 or current != reference:
            raise ValueError(f"{path}:{row.get('id')}: current speaker count differs from reference")

    baseline = vox.get("atomicBaseline")
    current = vox.get("current")
    if not isinstance(baseline, dict) or not isinstance(current, dict):
        raise ValueError(f"{path}: missing diarization aggregate sections")
    for section, keys in (
        (baseline, ("microDer", "macroJer")),
        (current, ("microDer", "macroJer", "miss", "falseAlarm", "confusion")),
    ):
        for key in keys:
            metric(section.get(key), f"{path}:{key}")
    if current["microDer"] > baseline["microDer"]:
        raise ValueError(f"{path}: current DER is worse than atomic baseline")
    if current["macroJer"] > baseline["macroJer"]:
        raise ValueError(f"{path}: current JER is worse than atomic baseline")
    error_sum = sum(Decimal(str(current[key])) for key in ("miss", "falseAlarm", "confusion"))
    # The committed rates are exact reported float outputs; their Decimal string
    # representations can differ by a few final binary-float rounding digits.
    if abs(error_sum - Decimal(str(current["microDer"]))) > Decimal("1e-15"):
        raise ValueError(f"{path}: current DER does not equal miss + false alarm + confusion")

    padding = result.get("silencePaddingInvariant")
    padding_rows = padding.get("samples") if isinstance(padding, dict) else None
    expected_durations = [120, 240, 299]
    if (
        not isinstance(padding_rows, list)
        or padding.get("durationsSeconds") != expected_durations
        or [row.get("id") for row in padding_rows if isinstance(row, dict)]
        != DIARIZATION_VOX_IDS
    ):
        raise ValueError(f"{path}: silence-padding diarization gate is stale")
    for row in padding_rows:
        reference_count = row.get("referenceSpeakerCount")
        padded_counts = row.get("paddedSpeakerCounts")
        if (
            not isinstance(reference_count, int)
            or reference_count < 1
            or not isinstance(padded_counts, list)
            or len(padded_counts) != len(expected_durations)
            or any(count != reference_count for count in padded_counts)
        ):
            raise ValueError(
                f"{path}:{row.get('id')}: trailing silence changes speaker count"
            )

    attribution = result.get("longMeetingAttribution")
    attribution_rows = (
        attribution.get("samples") if isinstance(attribution, dict) else None
    )
    if (
        not isinstance(attribution_rows, list)
        or attribution.get("sampleCount") != len(DIARIZATION_VOX_IDS)
        or [row.get("id") for row in attribution_rows if isinstance(row, dict)]
        != DIARIZATION_VOX_IDS
    ):
        raise ValueError(f"{path}: long-meeting attribution fixtures are stale")
    canonical_words = attribution.get("canonicalWords")
    baseline_attribution = attribution.get("dominantBlockBaseline")
    current_attribution = attribution.get("currentSentenceAllocation")
    if (
        not isinstance(canonical_words, int)
        or canonical_words <= 0
        or not isinstance(baseline_attribution, dict)
        or not isinstance(current_attribution, dict)
    ):
        raise ValueError(f"{path}: long-meeting attribution aggregate is invalid")
    for section in (baseline_attribution, current_attribution):
        if not isinstance(section.get("errors"), int) or section["errors"] < 0:
            raise ValueError(f"{path}: long-meeting attribution errors are invalid")
        metric(section.get("errorRate"), f"{path}:longMeetingAttribution:errorRate")
        expected_rate = Decimal(section["errors"]) / Decimal(canonical_words)
        if abs(Decimal(str(section["errorRate"])) - expected_rate) > Decimal("1e-15"):
            raise ValueError(f"{path}: long-meeting attribution rate is stale")
    if canonical_words != 677 or current_attribution["errors"] > 49:
        raise ValueError(
            f"{path}: long-meeting speaker attribution exceeds verified ceiling"
        )
    if (
        current_attribution.get("additionalAsrCalls") != 0
        or current_attribution.get("canonicalTextExact") is not True
    ):
        raise ValueError(f"{path}: long-meeting allocation is not lossless and bounded")
    if (
        sum(row.get("canonicalWords", -1) for row in attribution_rows)
        != canonical_words
        or sum(row.get("dominantErrors", -1) for row in attribution_rows)
        != baseline_attribution["errors"]
        or sum(row.get("currentErrors", -1) for row in attribution_rows)
        != current_attribution["errors"]
        or any(
            row.get("canonicalTextExact") is not True
            or row.get("timestampsMonotonic") is not True
            for row in attribution_rows
        )
    ):
        raise ValueError(f"{path}: long-meeting attribution sample totals are stale")

    controls = result.get("podcastFalsePositiveControls")
    control_rows = controls.get("samples") if isinstance(controls, dict) else None
    if not isinstance(control_rows, list) or controls.get("sampleCount") != len(DIARIZATION_PODCAST_IDS):
        raise ValueError(f"{path}: podcast control sampleCount is stale")
    if [row.get("id") for row in control_rows if isinstance(row, dict)] != DIARIZATION_PODCAST_IDS:
        raise ValueError(f"{path}: podcast control ids are stale")
    for row in control_rows:
        if row.get("addedSpeakers") != []:
            raise ValueError(f"{path}:{row.get('id')}: podcast control added a speaker")
        if (
            row.get("currentSpeakerCount") != row.get("atomicBaselineSpeakerCount")
            or row.get("currentTurnCount") != row.get("atomicBaselineTurnCount")
        ):
            raise ValueError(f"{path}:{row.get('id')}: podcast control differs from atomic baseline")


def validate_directory(directory: Path) -> None:
    podcasts = validate_samples(directory / "podcast_samples.json")
    full_videos = validate_samples(directory / "full_video_samples.json")
    validate_podcast_results(directory / "latest_results.json", podcasts)
    capture_path = directory / "capture_resampler_latest_results.json"
    validate_capture_resampler_results(capture_path, podcasts)
    capture_result = read_json(capture_path)
    validate_model_selection_results(
        directory / "model_selection_latest_results.json",
        podcasts,
        capture_result if isinstance(capture_result, dict) else None,
    )
    validate_combined_mixer_results(
        directory / "combined_mixer_latest_results.json",
        podcasts,
        capture_result if isinstance(capture_result, dict) else None,
    )
    validate_full_video_results(directory / "full_video_latest_results.json", full_videos)
    validate_diarization_results(directory / "diarization_latest_results.json")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path, nargs="?", default=Path("benchmarks"))
    args = parser.parse_args()
    validate_directory(args.directory)
    print(f"Validated benchmark metadata in {args.directory}")


if __name__ == "__main__":
    main()
