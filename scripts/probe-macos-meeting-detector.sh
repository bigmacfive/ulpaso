#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "meeting detector probe requires macOS" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
probe_binary="$(mktemp -t ulpaso-meeting-probe)"
trap 'unlink "$probe_binary" 2>/dev/null || true' EXIT

clang++ -std=c++17 -fobjc-arc \
  -framework AppKit \
  -framework CoreAudio \
  -framework CoreGraphics \
  -framework Foundation \
  "$repo_root/src-tauri/native/macos_meeting_detector.mm" \
  "$repo_root/src-tauri/native/probe_macos_meeting_detector.mm" \
  -o "$probe_binary"

"$probe_binary"
