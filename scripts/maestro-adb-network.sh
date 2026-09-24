#!/usr/bin/env bash
# Toggle Android emulator airplane mode for offline Maestro paths.
# Usage: maestro-adb-network.sh offline|online
set -euo pipefail

MODE="${1:-}"
if [[ "${MODE}" != "offline" && "${MODE}" != "online" ]]; then
  echo "usage: $0 offline|online" >&2
  exit 1
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "error: adb not found on PATH" >&2
  exit 1
fi

SERIAL_ARGS=()
if [[ -n "${ANDROID_SERIAL:-}" ]]; then
  SERIAL_ARGS=(-s "${ANDROID_SERIAL}")
fi

if [[ "${MODE}" == "offline" ]]; then
  adb "${SERIAL_ARGS[@]}" shell cmd connectivity airplane-mode enable
  adb "${SERIAL_ARGS[@]}" shell settings put global airplane_mode_on 1
  adb "${SERIAL_ARGS[@]}" shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true >/dev/null 2>&1 || true
  echo "OK: airplane mode enabled"
else
  adb "${SERIAL_ARGS[@]}" shell cmd connectivity airplane-mode disable
  adb "${SERIAL_ARGS[@]}" shell settings put global airplane_mode_on 0
  adb "${SERIAL_ARGS[@]}" shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false >/dev/null 2>&1 || true
  echo "OK: airplane mode disabled"
fi
