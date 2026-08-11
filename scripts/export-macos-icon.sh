#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(dirname "$script_dir")
icon_output=$(mktemp -d "${TMPDIR:-/tmp}/ulpaso-icon.XXXXXX")

cleanup() {
  case "$icon_output" in
    "${TMPDIR:-/tmp}"/ulpaso-icon.*) rm -rf -- "$icon_output" ;;
  esac
}
trap cleanup EXIT INT TERM

cd "$project_root"
pnpm icon:macos:source
pnpm exec tauri icon src-tauri/icon-source/macos-icon.svg --output "$icon_output"

for icon_file in 32x32.png 64x64.png 128x128.png 128x128@2x.png icon.png icon.icns; do
  cp "$icon_output/$icon_file" "src-tauri/icons/$icon_file"
done

echo "Exported the macOS icon set to src-tauri/icons"
