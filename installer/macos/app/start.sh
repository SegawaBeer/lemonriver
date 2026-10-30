#!/bin/bash
set -euo pipefail

RES="$(cd "$(dirname "$0")" && pwd)"
APP_BUNDLE="$(cd "$RES/../.." && pwd)"
LR_HOME="${LEMONRIVER_HOME:-$HOME}"
NODE="$RES/node/bin/node"
NODE_BIN="$RES/node/bin"
SUPPORT="$LR_HOME/Library/Application Support/LemonRiver"
STATE="$SUPPORT/state.json"
LOGS="$LR_HOME/Library/Logs/LemonRiver"
PLIST="$LR_HOME/Library/LaunchAgents/com.lemonriver.app.plist"
PIDFILE="$SUPPORT/service.pid"
LABEL="com.lemonriver.app"
DRY="${LEMONRIVER_DRY_LAUNCHD:-0}"

# Downloading the dmg marks every file inside the app, and with that mark still
# on it the system refuses to start the bundled node at all. The user has
# already let this app through in Privacy & Security, so clear the app's own
# marks before running anything; on a read-only volume this fails harmlessly.
if [ -n "$(/usr/bin/xattr -p com.apple.quarantine "$NODE" 2>/dev/null || true)" ]; then
  /usr/bin/xattr -dr com.apple.quarantine "$APP_BUNDLE" 2>/dev/null || true
fi

state_value() {
  "$NODE" "$RES/setup.mjs" state-get --file "$STATE" --key "$1"
}

dry_pid() {
  [ -f "$PIDFILE" ] || return 1
  local pid
  pid="$(/bin/cat "$PIDFILE" 2>/dev/null || true)"
  [ -n "$pid" ] || return 1
  /bin/kill -0 "$pid" 2>/dev/null || return 1
  printf '%s\n' "$pid"
}

service_state() {
  if [ "$DRY" = "1" ]; then
    if dry_pid >/dev/null; then echo running; else echo stopped; fi
    return
  fi
  local value
  value="$(/bin/launchctl print "gui/$(/usr/bin/id -u)/$LABEL" 2>/dev/null \
    | /usr/bin/awk -F'= ' '/state =/ {print $2; exit}' || true)"
  if [ "$value" = "running" ]; then echo running; else echo stopped; fi
}

start_service() {
  local workspace port
  workspace="$(state_value workspacePath)"
  port="$(state_value port)"

  if [ -z "$workspace" ] || [ -z "$port" ]; then
    /bin/bash "$RES/setup.sh"
    workspace="$(state_value workspacePath)"
    port="$(state_value port)"
  fi

  mkdir -p "$LOGS"

  if [ "$DRY" = "1" ]; then
    cd "$workspace"
    PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
      /usr/bin/nohup "$NODE" "$workspace/node_modules/@lemonriver/core/bin.js" dev \
      --host 127.0.0.1 --port "$port" --no-skills-check \
      >"$LOGS/app.out.log" 2>"$LOGS/app.err.log" &
    echo "$!" > "$PIDFILE"
    return
  fi

  /bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "$PLIST" 2>/dev/null || true
  /bin/launchctl kickstart -k "gui/$(/usr/bin/id -u)/$LABEL"
}

stop_service() {
  if [ "$DRY" = "1" ]; then
    local pid
    if pid="$(dry_pid)"; then /bin/kill "$pid" 2>/dev/null || true; fi
    /bin/rm -f "$PIDFILE"
    return
  fi
  /bin/launchctl bootout "gui/$(/usr/bin/id -u)/$LABEL" 2>/dev/null || true
}

case "${1:-ensure}" in
  url)
    printf 'http://127.0.0.1:%s/\n' "$(state_value port)"
    ;;
  logs)
    printf '%s\n' "$LOGS"
    ;;
  status)
    service_state
    ;;
  ensure)
    if [ "$(service_state)" != "running" ]; then
      start_service
    fi
    ;;
  stop)
    stop_service
    ;;
  *)
    echo "usage: start.sh <ensure|stop|status|url|logs>" >&2
    exit 1
    ;;
esac
