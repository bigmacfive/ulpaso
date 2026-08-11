# Release and device verification

Ulpaso's release workflow produces unsigned preview builds. Code signing and
notarization are intentionally outside this workflow; every generated release
DMG is accompanied by `SHA256SUMS.txt`.

## Automated build

Pushing a SemVer tag such as `v0.1.0` runs the Apple Silicon release workflow,
executes all quality gates, assembles the pinned Python runtime, builds the DMG,
and creates a GitHub prerelease. A manual workflow run keeps the same files as a
14-day Actions artifact instead of creating a release.

Before tagging:

1. Update the versions in `package.json`, `packages/markdown/package.json`,
   `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Move user-visible entries from `Unreleased` in `CHANGELOG.md` to the release.
3. Run `pnpm check`, `pnpm build`, and `pnpm tauri:build:unsigned` on an Apple
   Silicon Mac.
4. Install the generated DMG into `/Applications`, rather than testing only the
   build directory.

The packaged worker can be exercised independently of the UI after a local
build:

```sh
APP=src-tauri/target/release/bundle/macos/Ulpaso.app/Contents/Resources/resources
ULPASO_WORKER_PYTHON="$APP/asr-runtime/bin/python3" \
ULPASO_WORKER_PATH="$APP/asr/asr_worker.py" \
PYTHONPATH=scripts python3 -m unittest scripts/test_worker_protocol_e2e.py
```

## Native device matrix

Native audio changes are not release-ready until the following are exercised on
real hardware:

| Scenario | Expected result |
| --- | --- |
| microphone + system audio | both sources appear and stay time-aligned |
| microphone only | no ScreenCaptureKit dependency |
| system audio only | works without microphone samples |
| each permission denied | localized recovery action, no raw diagnostic text |
| microphone disconnected | recording stops with a recoverable error |
| worker killed once | capture continues and spool is replayed |
| app killed during capture | WAV header is repaired on next launch |
| 30+ minute meeting | bounded memory and final transcript reaches the end |
| cancellation | temporary WAV and PCM are removed |

Use `ULPASO_ASR_DIAGNOSTICS=1` only while testing. Do not attach logs containing
private transcript text to public issues.

## Model-quality gate

The unit suite does not claim speech-recognition quality. For ASR changes, rerun
the documented podcast and full-video benchmarks with the pinned models. Record
the date, model revision, aggregate CER/WER, latency, and real-time factor in the
result JSON; never commit source media or transcript output.
