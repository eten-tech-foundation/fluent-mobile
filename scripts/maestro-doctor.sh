#!/usr/bin/env bash
# Local health check for Android Maestro harness. Fails with next steps when incomplete.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=maestro-common.sh
source "${ROOT}/scripts/maestro-common.sh"

APP_ID="com.eten.fluent"
MAESTRO_BIN="${HOME}/.maestro/bin"
export PATH="${MAESTRO_BIN}:${PATH}"

status=0

ok() { echo "  OK  $*"; }
warn() { echo "  WARN $*"; }
fail() { echo "  FAIL $*"; status=1; }

echo "==> Java"
if command -v java >/dev/null 2>&1; then
  if major="$(maestro_java_major)" && [[ "${major}" -ge 17 ]]; then
    ok "java: $(java -version 2>&1 | head -1) (major ${major})"
  else
    fail "unsupported Java — need JDK 17+ (got: $(java -version 2>&1 | head -1))"
  fi
else
  fail "java missing — install JDK 17+ and set JAVA_HOME"
fi

echo "==> Maestro CLI"
if command -v maestro >/dev/null 2>&1; then
  ok "maestro: $(command -v maestro)"
  maestro --version 2>/dev/null || true
else
  fail "maestro missing — run: npm run maestro:install"
fi

SERIAL=""
echo "==> adb / device"
if command -v adb >/dev/null 2>&1; then
  ok "adb: $(command -v adb)"
  resolve_err="$(mktemp)"
  if SERIAL="$(maestro_resolve_android_serial 2>"${resolve_err}")"; then
    ok "device: ${SERIAL}"
  else
    fail "$(tr '\n' ' ' <"${resolve_err}" | sed 's/^error: //;s/[[:space:]]*$//')"
    SERIAL=""
  fi
  rm -f "${resolve_err}"
else
  fail "adb missing — install Android platform-tools"
fi

echo "==> App package ${APP_ID}"
if [[ -n "${SERIAL}" ]]; then
  if adb -s "${SERIAL}" shell pm path "${APP_ID}" >/dev/null 2>&1; then
    ok "installed: $(adb -s "${SERIAL}" shell pm path "${APP_ID}" | tr -d '\r')"
  else
    fail "package not installed — build Debug APK: npm run android (dev client, not Expo Go)"
  fi
else
  warn "skip package check (no device)"
fi

echo "==> adb reverse (Metro 8081)"
if [[ -n "${SERIAL}" ]]; then
  if adb -s "${SERIAL}" reverse --list 2>/dev/null | grep -q 'tcp:8081'; then
    ok "tcp:8081 reversed"
  else
    warn "tcp:8081 not reversed — run: npm run maestro:android:up (or adb -s ${SERIAL} reverse tcp:8081 tcp:8081)"
  fi
fi

echo "==> Workspace"
if [[ -f .maestro/config.yaml ]]; then
  ok ".maestro/config.yaml"
else
  fail ".maestro/config.yaml missing"
fi
if [[ -f .maestro/flows/smoke-launch.yaml ]]; then
  ok ".maestro/flows/smoke-launch.yaml"
else
  fail "smoke-launch.yaml missing"
fi

if [[ "${status}" -ne 0 ]]; then
  echo ""
  echo "doctor: FAILED — fix FAIL lines above, then re-run npm run maestro:doctor"
  exit 1
fi

echo ""
echo "doctor: OK"
echo "Next: npm run maestro:android:up  # then Metro with EXPO_PUBLIC_E2E_MODE=1"
echo "      npm run maestro:test:harness"
