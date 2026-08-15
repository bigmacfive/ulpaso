#!/bin/bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <dmg-path> [expected-version]" >&2
  exit 64
fi

dmg_path="$1"
expected_version="${2:-}"
source_background="src-tauri/dmg/ulpaso-dmg-background.png"
mount_point="$(mktemp -d /tmp/ulpaso-dmg.XXXXXX)"
compare_dir="$(mktemp -d /tmp/ulpaso-dmg-compare.XXXXXX)"
mounted=0

cleanup() {
  if [[ "$mounted" == "1" ]]; then
    hdiutil detach "$mount_point" -quiet || hdiutil detach "$mount_point" -force -quiet || true
  fi
  rmdir "$mount_point" 2>/dev/null || true
  rm -f "$compare_dir/source.bmp" "$compare_dir/bundled.bmp"
  rmdir "$compare_dir" 2>/dev/null || true
}
trap cleanup EXIT

require() {
  if ! "$@"; then
    echo "DMG verification failed: $*" >&2
    exit 1
  fi
}

require test -f "$dmg_path"
require test -f "$source_background"

# Some DMG formats include an SLA. Accept it only for this isolated,
# read-only verification mount.
printf 'Y\n' | hdiutil attach -readonly -nobrowse -mountpoint "$mount_point" "$dmg_path" >/dev/null
mounted=1

app_path="$mount_point/Ulpaso.app"
require test -d "$app_path"
require test -L "$mount_point/Applications"
require test -f "$mount_point/.DS_Store"
require grep -q 'ulpaso-dmg-background.png' < <(strings "$mount_point/.DS_Store")

# Keep the first download compact. The pinned transcription runtime is
# installed only after the user accepts the first-use meeting setup.
require test ! -e "$app_path/Contents/Resources/resources/asr-runtime"
dmg_bytes="$(stat -f '%z' "$dmg_path")"
require test "$dmg_bytes" -lt 60000000

background_path="$(find "$mount_point/.background" -maxdepth 1 -type f -name '*.png' -print -quit)"
require test -n "$background_path"

# create-dmg may rewrite PNG metadata on a different macOS runner. Compare
# normalized, uncompressed pixels so the artwork must still be identical.
sips -s format bmp "$source_background" --out "$compare_dir/source.bmp" >/dev/null
sips -s format bmp "$background_path" --out "$compare_dir/bundled.bmp" >/dev/null
require cmp "$compare_dir/source.bmp" "$compare_dir/bundled.bmp"

dimensions="$(sips -g pixelWidth -g pixelHeight "$background_path" 2>/dev/null)"
require grep -q 'pixelWidth: 660' <<<"$dimensions"
require grep -q 'pixelHeight: 400' <<<"$dimensions"

bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Contents/Info.plist")"
require test "$bundle_id" = "app.ulpaso.editor"
if [[ -n "$expected_version" ]]; then
  app_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Contents/Info.plist")"
  require test "$app_version" = "$expected_version"
fi

echo "Verified compact DMG, read-only mount, styled 660x400 background, Applications link, and Ulpaso.app"
