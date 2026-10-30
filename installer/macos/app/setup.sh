#!/bin/bash
set -euo pipefail

RES="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="${LEMONRIVER_APP_PATH:-$(cd "$RES/../.." && pwd)}"
LR_HOME="${LEMONRIVER_HOME:-$HOME}"
NODE="$RES/node/bin/node"
WORKSPACE="$LR_HOME/LemonRiver"
SUPPORT="$LR_HOME/Library/Application Support/LemonRiver"
STATE="$SUPPORT/state.json"
LOGS="$LR_HOME/Library/Logs/LemonRiver"
AGENTS="$LR_HOME/Library/LaunchAgents"
PLIST="$AGENTS/com.lemonriver.app.plist"
DESKTOP="$LR_HOME/Desktop"
ALIAS="$DESKTOP/LemonRiver.app"
LABEL="com.lemonriver.app"

show_error() {
  if [ "${LEMONRIVER_DRY_DIALOG:-0}" = "1" ]; then
    printf '%s\n' "$1" >&2
    return
  fi
  /usr/bin/osascript -e "display dialog \"$1\" buttons {\"好\"} default button \"好\" with title \"LemonRiver\"" \
    >/dev/null 2>&1 || true
}

LOCATION_PROBLEM="$("$NODE" "$RES/setup.mjs" location-check --app "$APP_PATH" 2>/dev/null || true)"
# A freshly mounted, quarantined dmg can refuse to run the bundled node at
# all, which is exactly the case this guard exists for, so repeat the check in
# shell when the node run produced nothing.
if [ -z "$LOCATION_PROBLEM" ]; then
  case "$APP_PATH" in
    /Volumes/*) LOCATION_PROBLEM="volume" ;;
    */AppTranslocation/*) LOCATION_PROBLEM="translocated" ;;
  esac
fi
if [ -n "$LOCATION_PROBLEM" ]; then
  show_error "请先把 LemonRiver 拖到「应用程序」文件夹，再从那里打开。"
  exit 78
fi

CORE_VERSION="$("$NODE" -p "require('$RES/workspace-template/node_modules/@lemonriver/core/package.json').version" 2>/dev/null || echo unknown)"

mkdir -p "$SUPPORT" "$LOGS" "$AGENTS"

if [ -f "$STATE" ] && [ "$("$NODE" "$RES/setup.mjs" state-get --file "$STATE" --key setup)" = "true" ]; then
  exit 0
fi

if [ ! -e "$WORKSPACE" ]; then
  /usr/bin/ditto "$RES/workspace-template" "$WORKSPACE"
  # A quarantined dmg carries the flag onto every copied file, which can get
  # the workspace's native toolchain blocked on first run.
  /usr/bin/xattr -dr com.apple.quarantine "$WORKSPACE" 2>/dev/null || true
fi

if [ -d "$DESKTOP" ] && [ ! -e "$ALIAS" ]; then
  if [ "${LEMONRIVER_DRY_DESKTOP:-0}" = "1" ]; then
    /bin/ln -sfn "$APP_PATH" "$ALIAS"
  else
    /usr/bin/osascript \
      -e 'on run argv' \
      -e 'tell application "Finder" to make alias file to POSIX file (item 1 of argv) at POSIX file (item 2 of argv)' \
      -e 'end run' "$APP_PATH" "$DESKTOP" >/dev/null 2>&1 || /bin/ln -sfn "$APP_PATH" "$ALIAS"
  fi
fi

if [ "${LEMONRIVER_DRY_DOCK:-0}" != "1" ]; then
  "$NODE" "$RES/setup.mjs" dock-add \
    --app "$APP_PATH" \
    --domain "${LEMONRIVER_DOCK_PLIST:-com.apple.dock}" \
    --home "$LR_HOME" \
    --reload "${LEMONRIVER_RELOAD_DOCK:-1}" >/dev/null
fi

PORT="$("$NODE" "$RES/setup.mjs" pick-port --start 5273 --end 5279 || true)"
if [ -z "$PORT" ]; then
  show_error "5273 到 5279 端口都被占用，LemonRiver 无法启动。请关掉占用这些端口的程序后重试。"
  exit 1
fi

cat > "$PLIST" <<PLIST_END
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$RES/node/bin/node</string>
    <string>$WORKSPACE/node_modules/@lemonriver/core/bin.js</string>
    <string>dev</string>
    <string>--host</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>$PORT</string>
    <string>--no-skills-check</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$RES/node/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>$WORKSPACE</string>
  <key>RunAtLoad</key>
  <false/>
  <key>KeepAlive</key>
  <false/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>$LOGS/app.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOGS/app.err.log</string>
</dict>
</plist>
PLIST_END

if [ "${LEMONRIVER_DRY_LAUNCHD:-0}" != "1" ]; then
  /bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "$PLIST" 2>/dev/null || true
fi

"$NODE" "$RES/setup.mjs" setup-done \
  --file "$STATE" \
  --port "$PORT" \
  --app "$APP_PATH" \
  --workspace "$WORKSPACE" \
  --version "$CORE_VERSION" \
  --logs "$LOGS"
