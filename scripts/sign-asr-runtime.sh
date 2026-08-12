#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h:h}"
runtime_dir="$project_dir/src-tauri/resources/asr-runtime"
signing_identity="${APPLE_SIGNING_IDENTITY:--}"

if [[ ! -x "$runtime_dir/bin/python3" ]]; then
  print -u2 "ASR runtime has not been prepared at $runtime_dir"
  exit 1
fi

typeset -a codesign_args
if [[ "$signing_identity" == "-" ]]; then
  codesign_args=(--force --sign -)
else
  codesign_args=(--force --options runtime --timestamp --sign "$signing_identity")
fi

signed_count=0
while IFS= read -r -d '' native_path; do
  file_type="$(/usr/bin/file -b "$native_path")"
  if [[ "$file_type" != *Mach-O* ]]; then
    continue
  fi

  /usr/bin/codesign "${codesign_args[@]}" "$native_path"
  /usr/bin/codesign --verify --strict "$native_path"
  (( signed_count += 1 ))
done < <(/usr/bin/find "$runtime_dir" -type f -print0)

if (( signed_count == 0 )); then
  print -u2 "No Mach-O files were found in the ASR runtime."
  exit 1
fi

print "Signed $signed_count native ASR runtime files."
