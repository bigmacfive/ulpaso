<div align="center">
  <h1>Ulpaso</h1>
  <p><strong>Meetings stay on your Mac.<br />Notes stay in Markdown.</strong></p>
  <p>A quiet, local-first Markdown editor with on-device meeting transcription for macOS.</p>
  <p>
    <a href="https://github.com/bigmacfive/ulpaso/actions/workflows/ci.yml"><img src="https://github.com/bigmacfive/ulpaso/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status" /></a>
    <a href="https://ulpaso.app/"><img src="https://img.shields.io/badge/macOS-15%2B-111111?style=flat-square&amp;logo=apple&amp;logoColor=white" alt="macOS 15 or later" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-111111?style=flat-square" alt="GPL-3.0-or-later license" /></a>
  </p>
  <p><a href="https://ulpaso.app/"><strong>Download the official app</strong></a> · <a href="#build-from-source">Build from source</a> · <a href="docs/PRIVACY.md">Privacy</a></p>
</div>

<p align="center">
  <a href="https://ulpaso.app/"><img src="docs/assets/ulpaso-intro.gif" width="960" alt="Ulpaso turns a local meeting transcript into a Markdown note" /></a>
</p>

Ulpaso edits ordinary Markdown files and transcribes meetings on your Mac. Documents, meeting audio, and transcripts stay local. There is no cloud workspace, account requirement, proprietary document format, or telemetry pipeline.

## What it does

- Focused WYSIWYG editing for GFM tables, task lists, links, images, blockquotes, lists, and syntax-highlighted code blocks.
- On-device microphone and system-audio transcription with organization for up to four speakers.
- Explicit recording consent: meeting detection can suggest starting notes, but recording begins only after you choose **Start recording**.
- Draft recovery, recent documents, focus mode, command palette, light and dark themes, and English, Korean, and Japanese interfaces.
- Plain `.md` files that remain usable in any compatible editor.

Meeting setup downloads approximately 1.3 GB of pinned speech and speaker models from Hugging Face. Later transcription runs locally. See [Privacy and data flow](docs/PRIVACY.md) for the exact network behavior, storage paths, model sources, and deletion rules.

## Official app and pricing

The signed and notarized macOS app is available at [ulpaso.app](https://ulpaso.app/). Download it and use every feature free for seven days without entering a card. If it fits your work, buy one perpetual license—there is no subscription or account—and activate up to two Macs.

Prices exclude applicable tax:

| Market | Regular price | First 100 licenses |
| --- | ---: | ---: |
| United States | US$12.99 | US$9.99 |
| South Korea | ₩12,000 | ₩10,000 |
| Japan | ¥1,500 | ¥1,200 |

Other supported countries receive locally adjusted pricing at checkout. Stripe displays the final local price and applicable tax before payment.

## Open-source build

This repository contains the GPL-3.0-or-later source build. It has no license-key requirement, automatic update function, official binary distribution, or official support. Build it directly from source and update it manually by reviewing and rebuilding a revision you trust.

The open-source build uses the separate bundle identifier `app.ulpaso.opensource`. Both builds require an Apple Silicon Mac running macOS 15 or later.

<a id="build-from-source"></a>

## Build from source

Install Xcode command-line tools, Node.js 20.19+ (Node 22 recommended), pnpm 10+, and Rust 1.90.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm tauri:dev
```

For frontend-only work, run `pnpm dev`. To assemble the pinned transcription runtime and build an unsigned local app:

```sh
pnpm prepare:asr-runtime
pnpm tauri:build
```

Runtime and model downloads are intentionally excluded from Git.

### Verify a checkout

```sh
pnpm check
pnpm build
```

`pnpm check` builds the reusable Markdown package, runs TypeScript and frontend tests, checks Rust formatting, runs Clippy and unit tests, exercises the lightweight Python suite, and validates benchmark manifests. After preparing the model runtime, you can also run `pnpm test:python:worker`.

## Project layout

```text
src/                         SolidJS editor and interface
packages/markdown/           Markdown ↔ ProseMirror JSON primitives
src-tauri/src/               Rust application and meeting controller
src-tauri/native/            ScreenCaptureKit/CoreAudio bridge
src-tauri/resources/asr/     Local transcription worker and frozen requirements
scripts/                     Runtime, icon, and benchmark tooling
benchmarks/                  Model-quality fixtures and aggregate results
docs/                        Architecture, privacy, and contributor documentation
```

## Contribute

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and report security concerns according to [SECURITY.md](SECURITY.md).

- [Architecture](docs/ARCHITECTURE.md)
- [Privacy and data flow](docs/PRIVACY.md)
- [Meeting worker protocol](docs/MEETING_PROTOCOL.md)
- [Source build verification](docs/RELEASE.md)
- [Roadmap](ROADMAP.md)

## License

The source code is licensed under [GNU GPL version 3 or later](LICENSE), except third-party components identified in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Ulpaso name and artwork are not granted by the source-code license; see [TRADEMARKS.md](TRADEMARKS.md).

<details>
<summary><strong>한국어</strong></summary>

Ulpaso는 일반 Markdown 파일을 직접 편집하고 회의 음성을 Mac 안에서 전사하는 로컬 우선 에디터입니다. 서명·공증된 공식 앱은 [ulpaso.app](https://ulpaso.app/)에서 다운로드할 수 있습니다. 카드 없이 7일간 모든 기능을 무료로 사용한 뒤, 마음에 들면 구독이나 계정 없이 영구 라이선스를 한 번만 구매해 Mac 두 대까지 활성화할 수 있습니다.

정상 가격은 미국 US$12.99, 한국 ₩12,000, 일본 ¥1,500이며 첫 100개 라이선스는 각각 US$9.99, ₩10,000, ¥1,200입니다. 세금은 별도이고, 그 밖의 지원 국가에는 현지 조정 가격이 적용됩니다.

이 저장소의 GPL-3.0-or-later 오픈소스 빌드는 소스에서 직접 빌드합니다. 라이선스 키, 자동 업데이트, 공식 바이너리 배포 및 공식 지원은 포함하지 않습니다.

</details>
