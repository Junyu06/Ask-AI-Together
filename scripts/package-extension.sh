#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$ROOT_DIR/Side-by-Side AI"
DIST_DIR="$ROOT_DIR/dist"
MANIFEST_PATH="$EXT_DIR/manifest.json"

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "manifest not found: $MANIFEST_PATH" >&2
  exit 1
fi

VERSION="$(awk -F'"' '/"version"[[:space:]]*:/ { print $4; exit }' "$MANIFEST_PATH")"
if [[ -z "$VERSION" ]]; then
  echo "failed to read version from $MANIFEST_PATH" >&2
  exit 1
fi

ZIP_NAME="side-by-side-ai-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"

(
  cd "$EXT_DIR"
  zip -r "$ZIP_PATH" . \
    -x "*.DS_Store" \
    -x "store-assets/*.raw.png"
)

if ! unzip -l "$ZIP_PATH" manifest.json >/dev/null 2>&1; then
  echo "package validation failed: manifest.json is not at the zip root" >&2
  exit 1
fi

echo "created: $ZIP_PATH"
