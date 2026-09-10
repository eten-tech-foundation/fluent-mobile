#!/usr/bin/env bash
# Prepare Android device for Debug + Metro Maestro runs.
# Does not start Metro for you — prints the exact command with E2E mode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_ID="com.eten.fluent"
export PATH="${HOME}/.maestro/bin:${PATH}"

echo "==> adb devices"
if ! command -v adb >/dev/null 2>&1; then
  echo "error: adb not found. Install Android platform-tools." >&2
  exit 1
fi

adb start-server >/dev/null
DEVICES="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
if [[ -z "${DEVICES}" ]]; then
  echo "error: no device/emulator online." >&2
  echo "Boot an AVD (Android Studio Device Manager) or plug in a device with USB debugging." >&2
  exit 1
fi
echo "${DEVICES}" | while read -r d; do echo "  device: ${d}"; done

echo "==> adb reverse tcp:8081 tcp:8081"
adb reverse tcp:8081 tcp:8081
adb reverse --list || true

if adb shell pm path "${APP_ID}" >/dev/null 2>&1; then
  echo "==> App installed: ${APP_ID}"
else
  echo "warn: ${APP_ID} not installed. Build the Debug/dev-client APK:"
  echo "  npm run android"
  echo "(Do not use Expo Go.)"
fi

echo ""
echo "OK: device ready for Maestro."
echo ""
echo "Start Metro with E2E Dev Menu suppression (local Debug only):"
echo "  EXPO_PUBLIC_E2E_MODE=1 npm start"
echo ""
echo "Optional: copy .env.maestro.example → .env.maestro and source it before flows."
echo "Harness smoke: npm run maestro:test:harness"
echo "Agent MCP:     npm run maestro:agent:up  (then wire .cursor/mcp.maestro.example.json)"
