#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "native audio capture contracts skipped: macOS required"
  exit 0
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
test_binary="$(mktemp -t ulpaso-native-audio-test)"
trap 'rm -f "$test_binary"' EXIT

xcrun clang++ \
  -std=c++17 \
  -fobjc-arc \
  -fblocks \
  -Wall \
  -Wextra \
  -Werror \
  "$repo_root/src-tauri/native/test_macos_audio_capture.mm" \
  -framework AppKit \
  -framework AVFoundation \
  -framework AudioToolbox \
  -framework CoreAudio \
  -framework CoreMedia \
  -framework Foundation \
  -framework ScreenCaptureKit \
  -o "$test_binary"

"$test_binary"
