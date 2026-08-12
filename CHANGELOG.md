# Changelog

All notable changes to Ulpaso will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1] - 2026-08-12

### Changed

- Replaced automatic meeting recording with an explicit **Record this meeting?** confirmation.
- Keep the macOS process and local detector active when the window is closed, then restore and focus the window when a meeting prompt is ready.
- Preserve the previous detection preference while renaming the setting to describe confirmation prompts accurately.

## [0.2.0] - 2026-08-12

### Added

- Debounced automatic meeting detection for major desktop and browser meeting apps, with first-use disclosure and duplicate-start protection.

### Changed

- Bumped the desktop app version so existing v0.1.0 installations receive the meeting-detection release through the signed updater.

### Added

- Local-first WYSIWYG Markdown editing with GFM support.
- On-device microphone and system-audio transcription with speaker organization.
- English, Korean, and Japanese interfaces.
- Draft recovery, recent documents, focus mode, command palette, and light/dark themes.
- Reproducible macOS packaging and a native-style application icon.
- First-use model size, network, local-processing, and free-disk disclosure.
- A publishable `@ulpaso/markdown` workspace package with a documented extension API.
- Automated signed and notarized releases, checksums, benchmark validation, and
  a real mock-worker protocol test.
- A centralized macOS shortcut set with an accessible in-app guide in Settings.
- Signed GitHub Releases with verified in-app update checks and installation.

### Changed

- Split audio mixing, recovery, worker framing, resource checks, model artifact
  verification, and major UI dialogs into focused modules with unit coverage.
- Reduced the production JavaScript entry from roughly 1.9 MB to 324 KB by
  registering syntax languages explicitly, splitting editor chunks, and using
  native Solid/DOM loaders instead of React bridges.
- Validate downloaded model files against committed revisions and SHA-256
  digests before local inference.

### Security

- Pinned model revisions and Python runtime dependencies.
- Checksum verification for the pinned `uv` bootstrap archive.
- Checksum verification for every pinned speech and diarization model file.
- Restricted Tauri capability and content-security policies.
- JavaScript and Rust dependency auditing in CI, with reviewed RustSec
  exceptions documented in `.cargo/audit.toml`.
