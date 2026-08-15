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
- `src-tauri/src/meeting_detection.rs` debounces high-confidence native meeting signals and emits one detection event per session; `src/meeting/detection_prompt.ts` owns frontend preference, suppression, and duplicate-prompt policy.
- `src-tauri/src/audio_capture.rs` is the safe Rust boundary around native capture callbacks.
- `src-tauri/native/macos_audio_capture.mm` captures microphone/system audio with Apple frameworks.

### Local inference

- `src-tauri/resources/asr/asr_worker.py` reads framed PCM on stdin and emits JSON events on stdout.
- Model files are downloaded to the application data directory and verified against upstream metadata before loading.
- The runtime requirements and model revisions are pinned. The compact app bundle bootstraps the local Python/MLX runtime on first use after explicit download consent.
- `tauri.conf.json` packages only the bootstrap and worker resources. `tauri.release.conf.json` adds signed updater artifacts without embedding the roughly 500 MB runtime or the roughly 1.3 GB of models.

## Meeting state flow

```text
idle → preparing/downloading → permission → recording → finalizing → idle
                                           ↘ error ↗
```

Rust is authoritative for the meeting state. The frontend renders localized labels from stable phases and error codes; raw backend diagnostics must never be shown directly to users.

Meeting detection uses a separate prompt flow:

```text
frontmost app/window + microphone-in-use signal
  -> native classification
  -> three-sample Rust debounce
  -> meeting://detection
  -> frontend preference / busy-session guard
  -> explicit recording prompt
  -> confirmed meeting_start command and first-use disclosure
```

Fifteen consecutive misses rearm detection for a later session. Until that clear transition, repeated signals are consumed, including signals observed during a manually started recording.

Audio is anti-aliased and resampled with independent, stateful system/microphone filters before it is mixed to mono 16 kHz, written to recovery WAV/PCM files, and streamed to the worker. In combined mode ScreenCaptureKit captures both sources on one media clock so long sessions do not align AVAudioEngine host time against ScreenCaptureKit presentation timestamps; microphone-only mode retains the native AVAudioEngine path. System-only capture preserves the source level through a transparent bounded path; combined capture retains source-specific mixing. Automatically detected meeting apps carry the exact frontmost window ID through startup so ScreenCaptureKit can revalidate its owning bundle and select its current display; this prevents an unrelated larger browser window on another monitor from redirecting capture. Capture sender and native ScreenCaptureKit requests carry monotonically increasing generations, preventing a delayed stop or callback from an earlier session from touching a newly started meeting. ScreenCaptureKit does not document a continuous system-audio callback cadence during silence, so callback age alone is not treated as a disconnect; explicit stream-delegate failures remain authoritative, while diagnostic sample counters expose a missing or stalled source for field investigation. The worker performs a responsive two-second decode plus a contiguous 20-second accuracy pass; because those blocks do not overlap, repeated boundary words are preserved. Explicitly truncated accuracy results receive one larger-budget retry, while a failed retry retains the first usable result. Valid model-detected languages are retained instead of being forced into Korean or English; only low-speech output whose writing system clearly contradicts its detected language is rejected. Full-file speaker analysis is limited to five minutes, while longer recordings reuse bounded streaming speaker state and split only clear two-speaker blocks at canonical sentence boundaries. Short-recording Sortformer probability frames are mapped back from their silence-trimmed clock before overlap resolution, and all speaker hypotheses are aligned onto canonical accuracy text so labels cannot add or remove document words. Final transcript segments are applied to the editor as ordinary Markdown-compatible content. Temporary files are removed after successful completion or cancellation and retained on unexpected failure; a worker crash during finalization replays the disk spool before retrying once.

## Invariants

- User documents remain ordinary Markdown files.
- Editor conversions must preserve supported Markdown through a round trip.
- UI text must be localized and must not reveal implementation-specific model/runtime names.
- Meeting audio and transcript contents stay on-device.
- Capture and worker failures must leave recoverable state instead of silently losing data.
- Final speaker segments must preserve the complete canonical transcript; speaker labels are discarded before transcript text is.
- The frontend does not receive filesystem access beyond the narrow Tauri commands.

## Tests

- Vitest covers Markdown conversion, editor behavior, meeting integration, localization, title-bar behavior, and loaders.
- Rust tests cover resampling, mixing, timing alignment, duration limits, worker framing, disk spooling, and WAV recovery.
- Python tests cover transcript sanitization, merging, language fallback, speaker segmentation, benchmark metrics, and worker protocol helpers.
