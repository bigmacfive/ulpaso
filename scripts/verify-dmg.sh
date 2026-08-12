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
mounted=0

cleanup() {
  if [[ "$mounted" == "1" ]]; then
    hdiutil detach "$mount_point" -quiet || hdiutil detach "$mount_point" -force -quiet || true
  fi
  rmdir "$mount_point" 2>/dev/null || true
}
trap cleanup EXIT

test -f "$dmg_path"
test -f "$source_background"

# Reading stdin from /dev/null is deliberate: a DMG containing an SLA/EULA
# cannot mount unattended and therefore fails this verification.
hdiutil attach -readonly -nobrowse -mountpoint "$mount_point" "$dmg_path" </dev/null >/dev/null
mounted=1

app_path="$mount_point/Ulpaso.app"
test -d "$app_path"
test -L "$mount_point/Applications"
test -f "$mount_point/.DS_Store"

background_path="$(find "$mount_point/.background" -maxdepth 1 -type f -name '*.png' -print -quit)"
test -n "$background_path"
cmp "$source_background" "$background_path"

dimensions="$(sips -g pixelWidth -g pixelHeight "$background_path" 2>/dev/null)"
grep -q 'pixelWidth: 660' <<<"$dimensions"
grep -q 'pixelHeight: 400' <<<"$dimensions"

bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Contents/Info.plist")"
test "$bundle_id" = "app.ulpaso.editor"
if [[ -n "$expected_version" ]]; then
  app_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Contents/Info.plist")"
  test "$app_version" = "$expected_version"
fi

echo "Verified unattended DMG mount, styled 660x400 background, Applications link, and Ulpaso.app"
