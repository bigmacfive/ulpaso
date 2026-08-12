# Architecture

Ulpaso is a macOS Tauri application with a SolidJS/ProseMirror frontend and a Rust/native audio backend. The meeting pipeline delegates inference to a persistent local Python worker.

## Layers

### Interface and editor

- `src/App.tsx` owns application-level UI state, native commands, persistence prompts, theme/locale selection, and meeting controls.
- `src/editor/` contains the ProseMirror editor, commands, node views, input rules, slash menu, and meeting transcript decorations.
- `packages/markdown/` is a framework-independent workspace package that converts between ProseMirror JSON and mdast. Round-trip tests are the compatibility contract for user files.
- `src/meeting/MeetingEditorBridge.ts` is the boundary between asynchronous transcript events and editor transactions.
- `src/i18n.ts` is the source of truth for English, Korean, and Japanese interface strings.

### Desktop shell

- `src-tauri/src/lib.rs` exposes narrow document open/save commands and configures application/window lifecycle.
- `src-tauri/src/meeting.rs` owns the meeting state machine and transcript events. `src-tauri/src/meeting/` separates deterministic audio preparation, recovery repair, resource inspection, and the disk-backed worker protocol.
- `src-tauri/src/meeting_detection.rs` debounces high-confidence native meeting signals and emits one detection event per session; `src/meeting/auto_start.ts` owns frontend preference and duplicate-start policy.
- `src-tauri/src/audio_capture.rs` is the safe Rust boundary around native capture callbacks.
- `src-tauri/native/macos_audio_capture.mm` captures microphone/system audio with Apple frameworks.

### Local inference

- `src-tauri/resources/asr/asr_worker.py` reads framed PCM on stdin and emits JSON events on stdout.
- Model files are downloaded to the application data directory and verified against upstream metadata before loading.
- The runtime requirements and model revisions are pinned. Release packaging assembles a relocatable Python runtime; development can bootstrap the same environment on first use.
- `tauri.conf.json` remains usable without the ignored runtime directory. Package scripts merge `tauri.release.conf.json` only after the release runtime has been prepared.

## Meeting state flow

```text
idle → preparing/downloading → permission → recording → finalizing → idle
                                           ↘ error ↗
```

Rust is authoritative for the meeting state. The frontend renders localized labels from stable phases and error codes; raw backend diagnostics must never be shown directly to users.

Automatic start uses a separate state flow:

```text
frontmost app/window + microphone-in-use signal
  -> native classification
  -> three-sample Rust debounce
  -> meeting://detection
  -> frontend preference / busy-session guard
  -> existing meeting_start command and first-use disclosure
```

Fifteen consecutive misses rearm detection for a later session. Until that clear transition, repeated signals are consumed, including signals observed during a manually started recording.

Audio is mixed to mono 16 kHz, written to recovery WAV/PCM files, and streamed to the worker. Final transcript segments are applied to the editor as ordinary Markdown-compatible content. Temporary files are removed after successful completion or cancellation and retained on unexpected failure.

## Invariants

- User documents remain ordinary Markdown files.
- Editor conversions must preserve supported Markdown through a round trip.
- UI text must be localized and must not reveal implementation-specific model/runtime names.
- Meeting audio and transcript contents stay on-device.
- Capture and worker failures must leave recoverable state instead of silently losing data.
- The frontend does not receive filesystem access beyond the narrow Tauri commands.

## Tests

- Vitest covers Markdown conversion, editor behavior, meeting integration, localization, title-bar behavior, and loaders.
- Rust tests cover resampling, mixing, timing alignment, duration limits, worker framing, disk spooling, and WAV recovery.
- Python tests cover transcript sanitization, merging, language fallback, speaker segmentation, benchmark metrics, and worker protocol helpers.
