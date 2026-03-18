#!/usr/bin/env bash
# Build Claude Fleet locally (GUI app + fleet CLI sidecar).
# Usage: ./scripts/build-local.sh [--debug]
set -euo pipefail

MODE="release"
CARGO_FLAG="--release"
if [[ "${1:-}" == "--debug" ]]; then
  MODE="debug"
  CARGO_FLAG=""
fi

# Detect native target triple
TARGET=$(rustc -vV | sed -n 's|host: ||p')
echo "==> Target: $TARGET  (mode: $MODE)"

# 1. Build fleet CLI
echo "==> Building fleet CLI..."
cargo build $CARGO_FLAG --bin fleet-cli --manifest-path src-tauri/Cargo.toml

# 2. Copy compiled binary into binaries/ so Tauri bundles the real binary
mkdir -p src-tauri/binaries
SRC="src-tauri/target/$MODE/fleet-cli"
DST="src-tauri/binaries/fleet-$TARGET"
cp "$SRC" "$DST"
chmod +x "$DST"
echo "==> Copied fleet CLI → $DST"

# 3. Build Tauri app (frontend + Rust main binary)
echo "==> Building Tauri app..."
npm run tauri build

echo ""
echo "Done! App bundle is in src-tauri/target/$TARGET/$MODE/bundle/"
