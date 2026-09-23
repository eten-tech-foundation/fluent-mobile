#!/usr/bin/env bash
# Hide Expo Dev Client Tools FAB on an installed Debug APK without rebuild.
# Preference key: showFab (expo.modules.devmenu.sharedpreferences).
# Proper durable fix: expo-dev-client plugin toolsButton: false (see app.config.ts) + prebuild.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=maestro-common.sh
source "${ROOT}/scripts/maestro-common.sh"

APP_ID="com.eten.fluent"
PREF_REL="shared_prefs/expo.modules.devmenu.sharedpreferences.xml"

SERIAL="$(maestro_resolve_android_serial)"
export ANDROID_SERIAL="${SERIAL}"

if ! adb -s "${SERIAL}" shell pm path "${APP_ID}" >/dev/null 2>&1; then
  echo "error: ${APP_ID} not installed" >&2
  exit 1
fi

adb -s "${SERIAL}" shell "run-as ${APP_ID} mkdir -p shared_prefs"
EXISTING="$(adb -s "${SERIAL}" shell "run-as ${APP_ID} cat ${PREF_REL}" 2>/dev/null || true)"
export EXISTING

TMP_HOST="$(mktemp)"
python3 - <<'PY' >"${TMP_HOST}"
import os
import re

raw = os.environ.get("EXISTING", "") or ""
entries = {
    "isOnboardingFinished": "true",
    "showsAtLaunch": "false",
    "showFab": "false",
}
for m in re.finditer(r'<boolean name="([^"]+)" value="([^"]+)"', raw):
    name, value = m.group(1), m.group(2)
    if name != "showFab":
        entries[name] = value
entries["showFab"] = "false"
entries["showsAtLaunch"] = "false"
entries.setdefault("isOnboardingFinished", "true")
lines = ["<?xml version='1.0' encoding='utf-8' standalone='yes' ?>", "<map>"]
for name, value in sorted(entries.items()):
    lines.append(f'    <boolean name="{name}" value="{value}" />')
lines.append("</map>")
print("\n".join(lines))
PY

# Push via run-as stdin (debug builds).
adb -s "${SERIAL}" shell "run-as ${APP_ID} sh -c 'cat > ${PREF_REL}'" <"${TMP_HOST}"
rm -f "${TMP_HOST}"

# FAB visibility is read into compose state — force-stop so next launch applies prefs.
adb -s "${SERIAL}" shell am force-stop "${APP_ID}"
echo "OK  set showFab=false for ${APP_ID} on ${SERIAL} (force-stopped; relaunch without clearState)"
echo "Durable: expo-dev-client plugin android.toolsButton=false in app.config.ts + npm run prebuild / Debug rebuild"
