# Source build verification

The open-source Ulpaso build is distributed as source code. It does not publish official signed binaries and has no automatic update function. Review the source, build it locally, and update it manually by rebuilding a revision you trust. The signed and notarized app is available separately from [ulpaso.app](https://ulpaso.app/).

Before proposing a revision:

1. Keep the versions in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` aligned.
2. Record user-visible changes in `CHANGELOG.md`.
3. Run `pnpm check` and `pnpm build`.
4. Exercise a local app build when native or packaging code changes.

The packaged worker can be exercised independently of the UI after a local build:

```sh
APP="src-tauri/target/release/bundle/macos/Ulpaso.app/Contents/Resources/resources"
ULPASO_WORKER_PYTHON="$APP/asr-runtime/bin/python3" \
ULPASO_WORKER_PATH="$APP/asr/asr_worker.py" \
PYTHONPATH=scripts python3 -m unittest scripts/test_worker_protocol_e2e.py
```

## Native device matrix

Native audio changes should be exercised on real hardware for microphone-only, system-only, and combined capture; permission denial; device disconnection; cancellation; recovery after interruption; long meetings; and every supported meeting-detection prompt. Recording must never start before the user explicitly chooses **Start recording**.

Use `ULPASO_ASR_DIAGNOSTICS=1` only while testing. Do not attach logs containing private transcript text to public issues.

## Model-quality gate

The unit suite does not claim speech-recognition quality. For ASR changes, rerun the documented podcast and full-video benchmarks with the pinned models. Record the date, model revision, aggregate CER/WER, latency, and real-time factor in the result JSON; never commit source media or transcript output.
