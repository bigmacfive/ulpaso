# Third-party notices

Ulpaso is licensed under MIT, but the repository also contains or interacts with components under their own licenses.

## Adapted editor code

Parts of the ProseKit/ProseMirror editor implementation were adapted from [Kuku](https://github.com/kuku-mom/kuku), copyright 2026 kuku-mom, under the MIT License. The required notice is preserved in [`licenses/KUKU_LICENSE.txt`](licenses/KUKU_LICENSE.txt).

## Fonts

- Goorm Sans and Goorm Sans Code are distributed under the SIL Open Font License 1.1. The copyright notice, Reserved Font Names, and license are preserved in [`public/fonts/LICENSE.md`](public/fonts/LICENSE.md).

## Local transcription

The exact Python dependency versions are pinned in [`src-tauri/resources/asr/requirements.lock`](src-tauri/resources/asr/requirements.lock). Runtime and downloaded-model notices are documented in [`src-tauri/resources/asr/THIRD_PARTY_NOTICES.md`](src-tauri/resources/asr/THIRD_PARTY_NOTICES.md).

Model files are not committed to this repository. They are downloaded directly from their upstream distribution repositories when the feature is first used and remain subject to the licenses published with those models.

## Package dependencies

JavaScript and Rust dependency versions are locked in `pnpm-lock.yaml` and `src-tauri/Cargo.lock`. Their copyright notices and licenses remain with their respective packages and upstream projects.
