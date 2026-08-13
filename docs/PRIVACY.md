# Privacy and data flow

Ulpaso is local-first. This document describes what leaves the device and what remains on it.

## Documents

Ulpaso reads and writes only files selected through the native open/save dialogs or recent-document paths already chosen by the user. Unsaved recovery drafts are stored in the app webview's local storage.

Document contents are not sent to an Ulpaso server. The open-source build has no account system, license API, update service, analytics SDK, advertising SDK, or telemetry endpoint.

## Meeting audio

After macOS permission is granted, Ulpaso can capture:

- microphone audio;
- system audio;
- or either source by itself as a recovery option.

Audio is mixed and processed locally. Temporary files live under the app data directory in `Meeting Recovery/`. They are deleted after a successful transcript or an explicit cancellation. If capture or inference exits unexpectedly, the files are retained so the recording can be recovered rather than discarded.

### Meeting detection prompts

Before transcription starts, Ulpaso checks only whether the default microphone device is currently in use and reads the frontmost application's bundle identifier, display name, and visible window title. It uses those local signals to recognize supported desktop meeting apps and browser meeting pages. It does not read or retain microphone samples during detection, and detection metadata is not written to disk or sent over the network.

Three consecutive matches are required before Ulpaso shows a native macOS notification. Recording never starts until the user chooses **Start recording** in that notification. A detected session is handled once, so dismissing the notification, duplicate checks, and a manual recording do not show another notification for the same meeting. Detection notifications can be disabled in Settings. Closing the macOS window hides it while the local detector remains active; the notification does not reopen the window, and quitting the app stops detection. First-use model download and disk-space disclosure still applies after confirmation and opens the window only when approval is required.

Ulpaso requests screen-recording permission only because macOS exposes system-audio capture through ScreenCaptureKit. The app does not save screen video frames.

## Network access

The editor itself does not need a network connection. The meeting feature makes outbound HTTPS requests when required to download:

- the pinned local Python/MLX runtime when a prepared runtime is not bundled;
- pinned transcription and speaker-separation model revisions from Hugging Face.

The downloaded artifacts are stored in the app data directory. Audio samples and transcript text are not included in those requests.

## Removing local data

Quit Ulpaso, then remove its application data directory if you want to delete downloaded models, runtime files, and retained meeting recovery audio. Saving or moving Markdown documents is independent of this directory because the documents remain wherever you chose to store them.
