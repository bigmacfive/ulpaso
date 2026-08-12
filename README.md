<div align="center">
  <img src="src-tauri/icons/icon.png" width="104" alt="Ulpaso logo" />
  <h1>Ulpaso</h1>
  <p>A quiet, local-first Markdown editor with on-device meeting notes.</p>
</div>

![Ulpaso editor](docs/assets/ulpaso-app.jpg)

> **Project status:** early preview. Ulpaso currently targets Apple Silicon Macs running macOS 15 or later. Tagged releases are signed, notarized, and delivered through GitHub Releases with in-app update checks.

## What it does

- Edits ordinary `.md` files in a focused WYSIWYG interface.
- Supports GFM tables, task lists, links, images, blockquotes, lists, and syntax-highlighted code blocks.
- Keeps drafts recoverable and asks before discarding unsaved work.
- Transcribes microphone and system audio locally, then organizes the result for up to four speakers.
- Provides light and dark themes plus English, Korean, and Japanese interfaces.
- Keeps document contents and meeting audio off application servers.

Ulpaso is deliberately small: there is no account, cloud workspace, proprietary document format, or telemetry pipeline.

## Privacy

Documents remain files you choose on your Mac. Meeting audio is processed on-device. The app downloads pinned model artifacts from Hugging Face the first time meeting notes are used; it does not upload document or recording contents to an Ulpaso service.

Temporary meeting recordings are removed after successful completion or cancellation. If transcription stops unexpectedly, recovery audio is retained in the app data directory so the session is not silently lost. See [Privacy and data flow](docs/PRIVACY.md) for exact paths and behavior.

The first meeting downloads about 1.2 GB of pinned speech and speaker models. The app discloses the expected download and installed size before starting; later transcription runs from local files.

## Requirements

- Apple Silicon Mac
- macOS 15 or later
- Xcode command-line tools
- Node.js 20.19+ (Node 22 recommended)
- pnpm 10+
- Rust 1.90

The editor UI can run in a browser on other platforms, but file dialogs, native saving, system-audio capture, and meeting transcription require the macOS desktop app.

## Develop

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm tauri:dev
```

For frontend-only work:

```sh
pnpm dev
```

The development app installs its pinned Python transcription runtime on first use. A production bundle assembles the same runtime ahead of time:

```sh
pnpm prepare:asr-runtime
pnpm tauri:build:unsigned
```

Runtime and model downloads are intentionally excluded from Git.

## Verify

```sh
pnpm check
pnpm build
```

`pnpm check` builds the reusable Markdown package, runs TypeScript checks, 127 frontend tests, Rust formatting and Clippy, 17 Rust tests, 12 lightweight Python tests including a real mock-worker process exchange, and benchmark-manifest validation. The 27-test model-worker suite can be run after preparing the runtime:

```sh
pnpm test:python:worker
```

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New document | <kbd>⌘ N</kbd> |
| Open document | <kbd>⌘ O</kbd> |
| Save | <kbd>⌘ S</kbd> |
| Save as | <kbd>⌘ ⇧ S</kbd> |
| Command palette | <kbd>⌘ K</kbd> |
| Settings | <kbd>⌘ ,</kbd> |
| Toggle sidebar | <kbd>⌘ \</kbd> |
| Focus mode | <kbd>⌘ ⇧ F</kbd> |
| Start or stop meeting notes | <kbd>⌘ ⇧ M</kbd> |
| Bold / italic / inline code | <kbd>⌘ B</kbd> / <kbd>⌘ I</kbd> / <kbd>⌘ E</kbd> |
| Strikethrough | <kbd>⌘ ⇧ X</kbd> |

Hover or focus the `?` button in Settings for the complete in-app guide.

## Project layout

```text
src/                         SolidJS editor and interface
packages/markdown/           Publishable Markdown ↔ ProseMirror JSON primitives
src-tauri/src/               Rust application and meeting controller
src-tauri/native/            ScreenCaptureKit/CoreAudio bridge
src-tauri/resources/asr/     Local transcription worker and frozen requirements
scripts/                     Reproducible runtime, icon, and benchmark tooling
benchmarks/                  Model-quality fixtures and aggregate results
docs/                        Architecture, privacy, and contributor documentation
```

Read [Architecture](docs/ARCHITECTURE.md) and the [meeting worker protocol](docs/MEETING_PROTOCOL.md) before changing the editor/meeting boundary. Release candidates follow the [device verification checklist](docs/RELEASE.md); near-term contribution areas are tracked in [ROADMAP.md](ROADMAP.md).

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and report security concerns according to [SECURITY.md](SECURITY.md).

Notable changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

Ulpaso is available under the [MIT License](LICENSE). Bundled fonts, adapted editor portions, local inference packages, and downloaded models retain their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md).

### 한국어

Ulpaso는 일반 Markdown 파일을 직접 편집하고, 회의 음성을 기기 안에서 전사하는 macOS용 로컬 우선 에디터입니다. 현재 Apple Silicon과 macOS 15 이상을 대상으로 하며, 계정·클라우드 문서 형식·텔레메트리를 사용하지 않습니다.
