# Contributing to Ulpaso

Thanks for helping improve Ulpaso. Keep changes focused, testable, and respectful of the app's local, on-device design.

## Before you start

- Use an Apple Silicon Mac running macOS 15 or later for native audio work.
- Use Node.js 20.19+ (22 recommended), pnpm 10+, and Rust 1.90.
- Search existing issues before opening a new one.
- For substantial user-facing or architectural changes, open an issue before investing in an implementation.
- Read [ROADMAP.md](ROADMAP.md) for scoped starter work. Protocol changes also require [docs/MEETING_PROTOCOL.md](docs/MEETING_PROTOCOL.md).

## Setup

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm tauri:dev
```

Frontend-only work can use `pnpm dev`. Meeting transcription installs its pinned local runtime on first use. Do not commit `src-tauri/resources/asr-runtime`, model files, build output, recordings, or local design audits.

The Markdown converter is an independent workspace package. Build or pack it with:

```sh
pnpm --filter @ulpaso/markdown build
pnpm --filter @ulpaso/markdown pack --pack-destination /tmp
```

## Quality gates

Run these before opening a pull request:

```sh
pnpm check
pnpm build
```

If you changed the model worker and have prepared the bundled runtime, also run:

```sh
pnpm test:python:worker
```

Native audio changes should be tested with microphone-only, system-only, and combined capture. Verify permission denial, device disconnection, cancellation, finalization, and recovery behavior.

## Pull requests

- Keep each pull request to one coherent change.
- Explain the user impact and the checks you ran.
- Add or update tests for behavior changes.
- Update English, Korean, and Japanese strings together.
- Do not expose model, runtime, or raw diagnostic names in user-facing UI.
- Preserve plain Markdown round trips and on-device data handling.

## Style

- TypeScript is formatted by the existing project style and checked by TypeScript/Vitest.
- Rust must pass `cargo fmt` and Clippy with warnings denied.
- Python should remain dependency-light outside the frozen worker runtime.
- Prefer small named components and explicit state transitions over implicit side effects.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
Participation is also governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
