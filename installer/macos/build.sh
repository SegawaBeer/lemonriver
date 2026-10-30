#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/out"
CACHE="$HERE/.cache"
APP="$OUT/LemonRiver.app"
STAGING="$OUT/staging"

NODE_VERSION="${LEMONRIVER_NODE_VERSION:-22.23.4}"
NODE_MIRROR="${LEMONRIVER_NODE_MIRROR:-https://npmmirror.com/mirrors/node}"
NPM_REGISTRY="${LEMONRIVER_NPM_REGISTRY:-https://registry.npmmirror.com/}"
SCOPE_REGISTRY="${LEMONRIVER_SCOPE_REGISTRY:-https://registry.npmjs.org/}"

CORE_VERSION="$(node -p "require('$ROOT/packages/core/package.json').version")"
DMG="$OUT/LemonRiver-$CORE_VERSION-arm64.dmg"

step() { printf '\n==> %s\n' "$1"; }

started_at="$(date +%s)"

step "Clean out/"
rm -rf "$OUT"
mkdir -p "$OUT" "$STAGING" "$CACHE"

step "Fetch Node v$NODE_VERSION (darwin-arm64)"
TARBALL="$CACHE/node-v$NODE_VERSION-darwin-arm64.tar.gz"
if [ ! -f "$TARBALL" ]; then
  curl -fsSL --retry 3 --max-time 600 \
    "$NODE_MIRROR/v$NODE_VERSION/node-v$NODE_VERSION-darwin-arm64.tar.gz" -o "$TARBALL"
fi
curl -fsSL --retry 3 --max-time 120 "$NODE_MIRROR/v$NODE_VERSION/SHASUMS256.txt" -o "$CACHE/SHASUMS256.txt"
EXPECTED="$(/usr/bin/awk -v f="node-v$NODE_VERSION-darwin-arm64.tar.gz" '$2 == f {print $1}' "$CACHE/SHASUMS256.txt")"
ACTUAL="$(/usr/bin/shasum -a 256 "$TARBALL" | /usr/bin/awk '{print $1}')"
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "checksum mismatch for $TARBALL (expected ${EXPECTED:-none}, got $ACTUAL)" >&2
  rm -f "$TARBALL"
  exit 1
fi

step "Scaffold workspace-template"
pnpm --filter @lemonriver/cli build >/dev/null
TEMPLATE="$OUT/workspace-template"
node "$ROOT/packages/cli/dist/cli.js" init "$TEMPLATE" --use-npm --no-install --no-git >/dev/null

cat > "$TEMPLATE/.npmrc" <<NPMRC
registry=$NPM_REGISTRY
@lemonriver:registry=$SCOPE_REGISTRY
NPMRC

step "Install workspace dependencies with the bundled Node/npm"
mkdir -p "$OUT/node"
/usr/bin/tar -xzf "$TARBALL" -C "$OUT/node" --strip-components=1
PATH="$OUT/node/bin:$PATH" "$OUT/node/bin/npm" --prefix "$TEMPLATE" install --no-audit --no-fund 2>&1 | /usr/bin/tail -5

step "Build icon"
ICONSET="$OUT/LemonRiver.iconset"
mkdir -p "$ICONSET"
(
  cd "$ROOT/packages/core"
  node "$HERE/render-icon.mjs" \
    "$ROOT/packages/core/src/app/lemonriver/brand/app-icon.svg" \
    "$ICONSET/icon_512x512@2x.png"
)
resize() { /usr/bin/sips -z "$1" "$1" "$ICONSET/icon_512x512@2x.png" --out "$ICONSET/$2" >/dev/null; }
resize 16 icon_16x16.png
resize 32 "icon_16x16@2x.png"
resize 32 icon_32x32.png
resize 64 "icon_32x32@2x.png"
resize 128 icon_128x128.png
resize 256 "icon_128x128@2x.png"
resize 256 icon_256x256.png
resize 512 "icon_256x256@2x.png"
resize 512 icon_512x512.png
/usr/bin/iconutil -c icns "$ICONSET" -o "$OUT/LemonRiver.icns"

step "Assemble LemonRiver.app"
/usr/bin/osacompile -o "$APP" "$HERE/app/launcher.applescript"
RES="$APP/Contents/Resources"
/usr/bin/ditto "$OUT/node" "$RES/node"
/usr/bin/ditto "$TEMPLATE" "$RES/workspace-template"
/bin/cp "$HERE/app/setup.sh" "$HERE/app/start.sh" "$HERE/app/setup.mjs" "$RES/"
/bin/chmod +x "$RES/setup.sh" "$RES/start.sh"
/bin/cp "$OUT/LemonRiver.icns" "$RES/LemonRiver.icns"

PLIST="$APP/Contents/Info.plist"
set_plist_key() {
  local key="$1"
  local value="$2"
  /usr/libexec/PlistBuddy -c "Set :$key $value" "$PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :$key string $value" "$PLIST"
}
set_plist_key CFBundleIdentifier com.lemonriver.app
set_plist_key CFBundleName LemonRiver
set_plist_key CFBundleDisplayName LemonRiver
set_plist_key CFBundleShortVersionString "$CORE_VERSION"
set_plist_key CFBundleVersion "$CORE_VERSION"
set_plist_key CFBundleIconFile LemonRiver
set_plist_key CFBundleIconName LemonRiver
set_plist_key LSMinimumSystemVersion 11.0
set_plist_key NSAppleEventsUsageDescription "LemonRiver 需要控制 Finder 建桌面快捷方式、重启程序坞。"

step "Ad-hoc sign"
/usr/bin/codesign --force --deep --sign - "$APP" >/dev/null

step "Build dmg"
/usr/bin/ditto "$APP" "$STAGING/LemonRiver.app"
/bin/ln -s /Applications "$STAGING/Applications"
/usr/bin/hdiutil create -volname "LemonRiver" -srcfolder "$STAGING" -ov -format UDZO "$DMG" >/dev/null
/usr/bin/hdiutil verify "$DMG" >/dev/null
rm -rf "$STAGING"

elapsed=$(( $(date +%s) - started_at ))
printf '\n==> %s\n' "$DMG"
printf 'core %s · %s · built in %ss\n' "$CORE_VERSION" "$(/usr/bin/du -h "$DMG" | /usr/bin/awk '{print $1}')" "$elapsed"
