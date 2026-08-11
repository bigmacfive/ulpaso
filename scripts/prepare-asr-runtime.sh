#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h:h}"
runtime_dir="$project_dir/src-tauri/resources/asr-runtime"
requirements_path="$project_dir/src-tauri/resources/asr/requirements.lock"
build_root="$project_dir/src-tauri/target/asr-runtime-build"
python_version="3.12.13"
uv_version="0.12.1"
uv_sha256="77d2906988e8074fd43f2f329ec452ebbf9b0c257ba1c66451c71de70a6baf42"
bundle_format="3"
platform_archive="uv-aarch64-apple-darwin"
marker_path="$runtime_dir/.ulpaso-bundle"
requirements_hash="$(/usr/bin/shasum -a 256 "$requirements_path" | /usr/bin/awk '{print $1}')"
expected_marker="format=$bundle_format python=$python_version uv=$uv_version requirements=$requirements_hash"

if [[ "$(/usr/bin/uname -m)" != "arm64" ]]; then
  print -u2 "ASR runtime bundles can only be prepared on Apple Silicon."
  exit 1
fi

if [[ -x "$runtime_dir/bin/python3" && -f "$marker_path" ]] &&
   [[ "$(<"$marker_path")" == "$expected_marker" ]]; then
  print "ASR runtime is already up to date."
  exit 0
fi

/bin/mkdir -p "$build_root"
uv_bin="${ULPASO_UV_BIN:-$build_root/uv-$uv_version}"
if [[ ! -x "$uv_bin" ]]; then
  archive_path="$build_root/$platform_archive.tar.gz"
  /usr/bin/curl --fail --location --silent --show-error \
    "https://github.com/astral-sh/uv/releases/download/$uv_version/$platform_archive.tar.gz" \
    --output "$archive_path"
  actual_sha256="$(/usr/bin/shasum -a 256 "$archive_path" | /usr/bin/awk '{print $1}')"
  if [[ "$actual_sha256" != "$uv_sha256" ]]; then
    /bin/rm -f "$archive_path"
    print -u2 "uv archive checksum verification failed."
    exit 1
  fi
  unpack_dir="$(/usr/bin/mktemp -d "$build_root/uv-unpack.XXXXXX")"
  /usr/bin/tar -xzf "$archive_path" -C "$unpack_dir"
  /bin/cp "$unpack_dir/$platform_archive/uv" "$uv_bin"
  /bin/chmod 755 "$uv_bin"
  /bin/rm -rf "$unpack_dir"
fi

python_store="$build_root/python"
"$uv_bin" python install "$python_version" \
  --install-dir "$python_store" \
  --no-bin
python_source="$python_store/cpython-$python_version-macos-aarch64-none"
if [[ ! -x "$python_source/bin/python3" ]]; then
  print -u2 "Pinned CPython installation was not created at $python_source"
  exit 1
fi

staging_dir="$(/usr/bin/mktemp -d "$project_dir/src-tauri/target/asr-runtime-stage.XXXXXX")"
/usr/bin/ditto "$python_source" "$staging_dir/runtime"
"$uv_bin" pip install \
  --system \
  --break-system-packages \
  --python "$staging_dir/runtime/bin/python3" \
  --python-preference only-system \
  --requirement "$requirements_path"

PYTHONDONTWRITEBYTECODE=1 "$staging_dir/runtime/bin/python3" - <<'PY'
import platform
import mlx
import mlx_audio
import mlx_qwen3_asr
import huggingface_hub
import numpy

assert platform.machine() == "arm64"
PY

while IFS= read -r -d '' native_path; do
  /usr/bin/codesign --force --sign - "$native_path" >/dev/null 2>&1
  /usr/bin/codesign --verify "$native_path"
done < <(/usr/bin/find "$staging_dir/runtime" -type f \( -name '*.so' -o -name '*.dylib' \) -print0)
/usr/bin/codesign --force --sign - "$staging_dir/runtime/bin/python3.12" >/dev/null 2>&1
/usr/bin/codesign --verify "$staging_dir/runtime/bin/python3.12"

runtime_freeze="$staging_dir/runtime-freeze.txt"
lock_freeze="$staging_dir/lock-freeze.txt"
PYTHONDONTWRITEBYTECODE=1 "$staging_dir/runtime/bin/python3" -m pip freeze | /usr/bin/sort > "$runtime_freeze"
/usr/bin/sed '/^#/d;/^$/d' "$requirements_path" | /usr/bin/sort > "$lock_freeze"
/usr/bin/diff -u "$lock_freeze" "$runtime_freeze"
/bin/rm "$runtime_freeze" "$lock_freeze"

print -n "$expected_marker" > "$staging_dir/runtime/.ulpaso-bundle"
print -n "$expected_marker" > "$staging_dir/runtime/.ulpaso-ready"
if [[ -e "$runtime_dir" ]]; then
  /bin/rm -rf "$runtime_dir"
fi
/bin/mv "$staging_dir/runtime" "$runtime_dir"
/bin/rmdir "$staging_dir"
print "Prepared relocatable ASR runtime at $runtime_dir"
