# Changelog

All notable changes to Ulpaso will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.3] - 2026-08-15

### Fixed

- Trust the bounded final diarization pass when it reduces noisy four-slot live output to two or more stable speakers, and compact sparse speaker numbers before writing Markdown.

### Added

- Added a two-step Settings action that removes downloaded transcription models, runtime files, tools, caches, and retained recovery audio before uninstalling Ulpaso.

## [0.5.2] - 2026-08-15

### Fixed

- Ask for native microphone consent on first launch when permission has not been decided, so Ulpaso is immediately registered in macOS Microphone privacy settings.

## [0.5.1] - 2026-08-15

### Fixed

- Added the hardened-runtime audio-input entitlement so macOS shows Ulpaso in Microphone privacy settings and presents the native consent prompt.
- Dispatch the first AVFoundation microphone authorization request on the AppKit main queue.
- Verify the usage description and signed audio-input entitlement before every published macOS release.

## [0.5.0] - 2026-08-15

### Added

- Added continuous transcript scrolling so the newest live speech remains visible while recording.
- Added native microphone-permission status, request, and System Settings recovery controls.
- Added guarded meeting prompts that stay suppressed after the user edits, invokes a command, or dismisses a prompt.
- Added stronger speaker reconciliation so partial diarization cannot merge or drop canonical transcript text.
- Added compact update notices, sidebar and theme refinements, capture diagnostics, and broader audio/transcription benchmarks.

### Changed

- Consolidated Ulpaso as a free MIT-licensed application with no account, payment, trial, or license-key gate.
- Reduced the initial application bundle by downloading the pinned local runtime and models only after explicit setup consent.
- Refined the DMG artwork and drag-to-Applications layout while preserving signed in-app updates from GitHub Releases.
- Hardened meeting detection, multimonitor window targeting, capture generations, long-session audio alignment, worker recovery, and multilingual transcript validation.

## [0.2.4] - 2026-08-13

### Fixed

- Detect supported meeting apps when they are playing system audio even if no microphone input device is connected.
- Keep the native meeting prompt opt-in: audio detection never starts recording until the user selects **Start recording**.

## [0.2.3] - 2026-08-13

### Added

- Added an explicit native macOS microphone-permission control in Settings, including live status refresh and a direct link to the Microphone privacy pane after denial.
- Added an editorial 660×400 install background and an automated DMG check that rejects license prompts, missing artwork, incorrect versions, or broken Applications links.

### Changed

- Request microphone access through the native macOS dialog immediately before the first recording that needs microphone audio.
- Tuned speaker activity detection against labeled two-, three-, and four-speaker VoxConverse recordings so quieter speakers remain visible in meeting notes.
- Removed the DMG license agreement so opening the downloaded image goes directly to drag-and-drop installation.

## [0.2.2] - 2026-08-13

### Changed

- Replaced the in-app meeting confirmation dialog with a native macOS notification that appears while the editor window is hidden.
- Added **Start recording** and **Not now** notification actions without restoring or focusing the app window.
- Keep first-use model disclosure intact: the window opens only after **Start recording** when local resources still need approval.

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

- Local WYSIWYG Markdown editing with GFM support.
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
