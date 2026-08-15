#!/bin/bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <dmg-path>" >&2
  exit 64
fi

dmg_path="$1"
layout_source="src-tauri/dmg/ulpaso-dmg-layout.DS_Store.base64"
temp_dir="$(mktemp -d /tmp/ulpaso-dmg-layout.XXXXXX)"
mount_point="$temp_dir/mount"
writable_dmg="$temp_dir/writable.dmg"
final_dmg="$temp_dir/final.dmg"
mounted=0

cleanup() {
  if [[ "$mounted" == "1" ]]; then
    hdiutil detach "$mount_point" -quiet || hdiutil detach "$mount_point" -force -quiet || true
  fi
  rm -rf "$temp_dir"
}
trap cleanup EXIT

test -f "$dmg_path"
test -f "$layout_source"
mkdir "$mount_point"

# Finder can skip writing .DS_Store on headless macOS runners even when the
# create-dmg AppleScript succeeds. Reopen the image as writable and install a
# known-good layout so release images always retain their artwork and icons.
hdiutil convert "$dmg_path" -format UDRW -o "$writable_dmg" >/dev/null
printf 'Y\n' | hdiutil attach -readwrite -noverify -noautoopen -nobrowse \
  -mountpoint "$mount_point" "$writable_dmg" >/dev/null
mounted=1
if [[ -f "$mount_point/.background/dmg-background.png" ]]; then
  mv "$mount_point/.background/dmg-background.png" \
    "$mount_point/.background/ulpaso-dmg-background.png"
fi
base64 -D -i "$layout_source" -o "$mount_point/.DS_Store"
chmod 644 "$mount_point/.DS_Store"
sync
hdiutil detach "$mount_point" -quiet
mounted=0

hdiutil convert "$writable_dmg" -format UDZO -imagekey zlib-level=9 -o "$final_dmg" >/dev/null
mv "$final_dmg" "$dmg_path"

echo "Installed deterministic Finder layout in $dmg_path"
