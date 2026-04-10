#!/usr/bin/env bash
# Build Claw Fleet locally (GUI app + fleet CLI sidecar).
# Usage: ./scripts/build-local.sh [--debug] [--notarize]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

MODE="release"
CARGO_FLAG="--release"
NOTARIZE=false

for arg in "$@"; do
  case "$arg" in
    --debug)    MODE="debug"; CARGO_FLAG="" ;;
    --notarize) NOTARIZE=true ;;
  esac
done

# ── Load signing config ──────────────────────────────────────────────────────
SIGNING_CONF="$SCRIPT_DIR/signing.local"
APPLE_SIGNING_IDENTITY=""
APPLE_INSTALLER_IDENTITY=""
if [[ -f "$SIGNING_CONF" ]]; then
  source "$SIGNING_CONF"
  echo "==> Signing identity: $APPLE_SIGNING_IDENTITY"
  [[ -n "$APPLE_INSTALLER_IDENTITY" ]] && echo "==> Installer identity: $APPLE_INSTALLER_IDENTITY"
else
  echo "==> No scripts/signing.local found — will use ad-hoc signing (no sandbox, no notarization)"
fi

# ── Generate dev version ──────────────────────────────────────────────────────
# Format: {YY}.{M}.{D}-dev.{epoch}  e.g. 25.3.19-dev.1742371234
# Valid SemVer — no leading zeros allowed in numeric components
YY=$(date +%y)
MM=$((10#$(date +%m)))   # strip leading zero: 03 → 3
DD=$((10#$(date +%d)))   # strip leading zero: 09 → 9
DEV_VERSION="${YY}.${MM}.${DD}-dev.$(date +%s)"
echo "==> Dev version: $DEV_VERSION"

CARGO_TOML="src-tauri/Cargo.toml"
CARGO_TOML_BAK="${CARGO_TOML}.bak"

# Patch Cargo.toml and restore on exit
cp "$CARGO_TOML" "$CARGO_TOML_BAK"
trap 'mv "$CARGO_TOML_BAK" "$CARGO_TOML"' EXIT

sed -i.tmp "s/^version = \".*\"/version = \"${DEV_VERSION}\"/" "$CARGO_TOML"
rm -f "${CARGO_TOML}.tmp"

# Detect native target triple
TARGET=$(rustc -vV | sed -n 's|host: ||p')
echo "==> Target: $TARGET  (mode: $MODE)"

# 1. Build fleet CLI sidecar (native, no GUI deps — this is a CLI binary)
echo "==> Building fleet CLI (native)..."
cargo build $CARGO_FLAG --bin fleet-cli --manifest-path "$CARGO_TOML"

# 2. Copy compiled binary into binaries/ so Tauri bundles the real binary
mkdir -p src-tauri/binaries
SRC="src-tauri/target/$MODE/fleet-cli"
DST="src-tauri/binaries/fleet-$TARGET"
cp "$SRC" "$DST"
chmod +x "$DST"
echo "==> Copied fleet CLI → $DST"

# 3. Build Tauri app (frontend + Rust main binary, .app only — we create DMG/PKG ourselves)
echo "==> Building Tauri app..."
npx tauri build --features gui,tts --bundles app

# 4. Sign with entitlements (macOS only)
APP_BUNDLE="src-tauri/target/$MODE/bundle/macos/Claw Fleet.app"
if [[ -d "$APP_BUNDLE" ]]; then
  if [[ -n "$APPLE_SIGNING_IDENTITY" ]]; then
    echo "==> Signing with Developer ID + sandbox entitlements..."
    codesign --force --deep --sign "$APPLE_SIGNING_IDENTITY" \
      --entitlements src-tauri/entitlements.plist \
      --options runtime \
      "$APP_BUNDLE"
  else
    echo "==> Ad-hoc signing with entitlements (sandbox won't be enforced)..."
    codesign --force --deep --sign - \
      --entitlements src-tauri/entitlements.plist \
      "$APP_BUNDLE"
  fi

  # 5. Create DMG with the signed .app
  DMG_DIR="src-tauri/target/$MODE/bundle/dmg"
  mkdir -p "$DMG_DIR"
  DMG_NAME="claw-fleet-${DEV_VERSION}.dmg"
  echo "==> Creating DMG..."
  DMG_STAGING=$(mktemp -d)
  cp -R "$APP_BUNDLE" "$DMG_STAGING/"
  ln -s /Applications "$DMG_STAGING/Applications"
  hdiutil create -volname "Claw Fleet" \
    -srcfolder "$DMG_STAGING" \
    -ov -format UDZO \
    "$DMG_DIR/$DMG_NAME"
  rm -rf "$DMG_STAGING"
  echo "==> DMG: $DMG_DIR/$DMG_NAME"

  # 6. Build PKG installer
  PKG_DIR="src-tauri/target/$MODE/bundle/pkg"
  mkdir -p "$PKG_DIR"
  PKG_NAME="claw-fleet-${DEV_VERSION}.pkg"
  echo "==> Building PKG installer..."
  if [[ -n "$APPLE_INSTALLER_IDENTITY" ]]; then
    pkgbuild --component "$APP_BUNDLE" \
      --identifier "com.hoveychen.claw-fleet" \
      --version "$DEV_VERSION" \
      --install-location "/Applications" \
      --sign "$APPLE_INSTALLER_IDENTITY" \
      "$PKG_DIR/$PKG_NAME"
  else
    pkgbuild --component "$APP_BUNDLE" \
      --identifier "com.hoveychen.claw-fleet" \
      --version "$DEV_VERSION" \
      --install-location "/Applications" \
      "$PKG_DIR/$PKG_NAME"
  fi
  echo "==> PKG: $PKG_DIR/$PKG_NAME"
  open "$PKG_DIR/$PKG_NAME"
fi

# 7. Notarize (optional, requires signing.local with API key)
if [[ "$NOTARIZE" == true ]]; then
  if [[ -z "${APP_STORE_CONNECT_KEY:-}" ]]; then
    echo "ERROR: --notarize requires APP_STORE_CONNECT_KEY in scripts/signing.local"
    exit 1
  fi

  echo "==> Preparing for notarization..."
  NOTARIZE_TMP=$(mktemp -d)
  trap 'rm -rf "$NOTARIZE_TMP"; mv "$CARGO_TOML_BAK" "$CARGO_TOML"' EXIT

  # Decode API key
  echo "$APP_STORE_CONNECT_KEY" | base64 --decode > "$NOTARIZE_TMP/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8"

  # Create zip for submission
  echo "==> Creating zip for notarization..."
  ditto -c -k --keepParent "$APP_BUNDLE" "$NOTARIZE_TMP/app.zip"

  # Submit
  echo "==> Submitting to Apple notary service..."
  xcrun notarytool submit "$NOTARIZE_TMP/app.zip" \
    --key "$NOTARIZE_TMP/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8" \
    --key-id "$APP_STORE_CONNECT_KEY_ID" \
    --issuer "$APP_STORE_CONNECT_ISSUER_ID" \
    --wait --timeout 15m

  # Staple app bundle
  echo "==> Stapling notarization ticket to app..."
  xcrun stapler staple "$APP_BUNDLE"

  # Re-create DMG with stapled app
  echo "==> Re-creating DMG with notarized app..."
  rm -f "$DMG_DIR"/*.dmg
  DMG_NAME="claw-fleet-${DEV_VERSION}.dmg"
  DMG_STAGING=$(mktemp -d)
  cp -R "$APP_BUNDLE" "$DMG_STAGING/"
  ln -s /Applications "$DMG_STAGING/Applications"
  hdiutil create -volname "Claw Fleet" \
    -srcfolder "$DMG_STAGING" \
    -ov -format UDZO \
    "$DMG_DIR/$DMG_NAME"
  rm -rf "$DMG_STAGING"

  # Re-create and notarize PKG with stapled app
  echo "==> Re-creating PKG with notarized app..."
  rm -f "$PKG_DIR"/*.pkg
  PKG_NAME="claw-fleet-${DEV_VERSION}.pkg"
  if [[ -n "${APPLE_INSTALLER_IDENTITY:-}" ]]; then
    pkgbuild --component "$APP_BUNDLE" \
      --identifier "com.hoveychen.claw-fleet" \
      --version "$DEV_VERSION" \
      --install-location "/Applications" \
      --sign "$APPLE_INSTALLER_IDENTITY" \
      "$PKG_DIR/$PKG_NAME"
  else
    pkgbuild --component "$APP_BUNDLE" \
      --identifier "com.hoveychen.claw-fleet" \
      --version "$DEV_VERSION" \
      --install-location "/Applications" \
      "$PKG_DIR/$PKG_NAME"
  fi

  echo "==> Notarizing PKG..."
  xcrun notarytool submit "$PKG_DIR/$PKG_NAME" \
    --key "$NOTARIZE_TMP/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8" \
    --key-id "$APP_STORE_CONNECT_KEY_ID" \
    --issuer "$APP_STORE_CONNECT_ISSUER_ID" \
    --wait --timeout 15m

  xcrun stapler staple "$PKG_DIR/$PKG_NAME"
  echo "==> PKG notarized: $PKG_DIR/$PKG_NAME"

  echo "==> Notarization complete!"
fi

echo ""
echo "Done! Version: $DEV_VERSION"
echo "App bundle: src-tauri/target/$MODE/bundle/"
