#!/usr/bin/env bash
# Prepare Android device for Debug + Metro Maestro runs.
# Does not start Metro for you — prints the exact command with E2E mode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=maestro-common.sh
source "${ROOT}/scripts/maestro-common.sh"

APP_ID="com.eten.fluent"
export PATH="${HOME}/.maestro/bin:${PATH}"

echo "==> adb device"
SERIAL="$(maestro_resolve_android_serial)"
export ANDROID_SERIAL="${SERIAL}"
echo "  device: ${SERIAL}"

echo "==> adb -s ${SERIAL} reverse tcp:8081 tcp:8081"
adb -s "${SERIAL}" reverse tcp:8081 tcp:8081
adb -s "${SERIAL}" reverse --list || true

if adb -s "${SERIAL}" shell pm path "${APP_ID}" >/dev/null 2>&1; then
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
