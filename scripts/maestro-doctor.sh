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

echo "==> Metro :8081 (identity)"
METRO_PID=""
if command -v lsof >/dev/null 2>&1; then
  METRO_PID="$(lsof -nP -t -iTCP:8081 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
fi
if [[ -z "${METRO_PID}" ]]; then
  warn "nothing listening on :8081 — start: EXPO_PUBLIC_E2E_MODE=1 npx expo start --port 8081 (persistent terminal)"
elif curl -sf "http://127.0.0.1:8081/status" 2>/dev/null | grep -q 'packager-status:running'; then
  ok "packager-status:running (pid ${METRO_PID})"
  METRO_CWD=""
  if command -v lsof >/dev/null 2>&1; then
    METRO_CWD="$(lsof -a -p "${METRO_PID}" -d cwd 2>/dev/null | awk 'NR==2 {print $NF}' || true)"
  fi
  if [[ -n "${METRO_CWD}" ]]; then
    # Resolve both paths (ROOT may be a symlink)
    root_real="$(cd "${ROOT}" && pwd -P 2>/dev/null || pwd)"
    cwd_real="$(cd "${METRO_CWD}" 2>/dev/null && pwd -P 2>/dev/null || echo "${METRO_CWD}")"
    if [[ "${cwd_real}" == "${root_real}" ]]; then
      ok "listener cwd: ${METRO_CWD}"
    else
      fail "listener cwd is not this repo (${METRO_CWD}) — stop foreign Metro or use the fluent-mobile packager"
    fi
  else
    warn "could not resolve listener cwd for pid ${METRO_PID}"
  fi
  # Foreign TCP clients (e.g. another app's simulator) — confuse Dev Client history / kill-port instincts
  if command -v lsof >/dev/null 2>&1; then
    foreign="$(
      lsof -nP -iTCP:8081 2>/dev/null | awk -v listen_pid="${METRO_PID}" '
        NR > 1 && $2 != listen_pid && $1 !~ /^(node|qemu-syst|adb)$/ && $8 ~ /ESTABLISHED|CLOSE_WAIT/ {
          print $1 " pid=" $2
        }
      ' | sort -u || true
    )"
    if [[ -n "${foreign}" ]]; then
      while IFS= read -r line; do
        [[ -z "${line}" ]] && continue
        warn "foreign client on :8081: ${line} — kill the client (not Fluent Metro) if Dev Client shows the wrong app"
      done <<<"${foreign}"
    fi
  fi
else
  fail "port :8081 is in use (pid ${METRO_PID}) but /status is not packager-status:running — wrong process or Metro still starting"
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
echo "Agent: .claude/skills/fluent-maestro/SKILL.md  |  rule: .cursor/rules/maestro-qa.mdc"
echo "Before product flows: Maestro MCP list_devices → inspect_screen (non-empty hierarchy)"
