# Release and device verification

Ulpaso's release workflow produces signed and notarized Apple Silicon builds.
Every release includes a DMG checksum plus a signed Tauri updater bundle and
`latest.json` for the in-app updater.

## Automated build

Pushing a SemVer tag such as `v0.1.0` runs the Apple Silicon release workflow,
executes all quality gates, builds the compact bootstrap application, signs and
notarizes it, and creates a GitHub release. The local runtime and models remain
outside the initial app bundle and are installed only after first-use consent. A manual workflow run
keeps the same files as a 14-day Actions artifact instead of creating a release.

The workflow requires `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, and
`TAURI_SIGNING_PRIVATE_KEY` as GitHub Actions secrets. Keep the updater private
key backed up outside GitHub; losing it prevents updates for existing installs.

Before tagging:

1. Update the application versions in `package.json`, `src-tauri/Cargo.toml`,
   and `src-tauri/tauri.conf.json`. Update `packages/markdown/package.json`
   separately only when publishing that package.
2. Move user-visible entries from `Unreleased` in `CHANGELOG.md` to the release.
3. Run `pnpm check` and `pnpm build`. A full signed release build requires the
   same signing and notarization environment variables used by CI.
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
| Close the macOS window, then detect a supported meeting | one native notification appears; the window remains hidden |
| Supported desktop meeting app + active microphone | one notification after three checks; no recording before **Start recording** |
| **Start recording** with resources ready | recording starts without restoring or focusing the window |
| Browser without a meeting title or microphone use | no notification |
| Dismissed or duplicate detection | no second notification in the same session |
| Detection during a manual recording | no notification and no automatic restart |
| First confirmed detected meeting | model/download disclosure is still shown |
| cancellation | temporary WAV and PCM are removed |

Use `ULPASO_ASR_DIAGNOSTICS=1` only while testing. Do not attach logs containing
private transcript text to public issues.

## Model-quality gate

The unit suite does not claim speech-recognition quality. For ASR changes, rerun
the documented podcast and full-video benchmarks with the pinned models. Record
the date, model revision, aggregate CER/WER, latency, and real-time factor in the
result JSON; never commit source media or transcript output.
