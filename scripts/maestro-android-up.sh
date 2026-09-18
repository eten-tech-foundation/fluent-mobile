#!/usr/bin/env bash
# Prepare Android device for Debug + Metro Maestro runs (deep-link launch).
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
echo "OK: device ready for Maestro (metro deep-link mode)."
echo ""
echo "Start Metro with E2E Dev Menu suppression (local Debug only):"
echo "  npm run maestro:metro   # all interfaces; do not use --localhost"
echo ""
echo "Flows deep-link past the Dev Client launcher via"
echo "  exp+fluent-mobile://expo-development-client/?url=http://10.0.2.2:8081…"
echo "(see .maestro/helpers/open-metro-deeplink.yaml). Keep Metro running."
echo ""
echo "Embedded APK (no Metro) — path C:"
echo "  MAESTRO_E2E_APK=/path/to.apk npm run maestro:android:e2e-up"
echo "  MAESTRO_LAUNCH_MODE=embedded npm run maestro:test:harness"
echo ""
echo "Harness: npm run maestro:test:harness"
