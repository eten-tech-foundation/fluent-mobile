#!/usr/bin/env bash
# Run Maestro with ~/.maestro/bin on PATH (same as doctor / MCP wrappers).
# Loads .env.maestro when present so MAESTRO_* / related keys reach Maestro.
# Values are parsed literally (no Bash expansion) — safe under `set -u`.
# Scrubs MAESTRO_* secrets from --test-output-dir artifacts on exit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=maestro-env.sh
source "${ROOT}/scripts/maestro-env.sh"
# shellcheck source=maestro-common.sh
source "${ROOT}/scripts/maestro-common.sh"

export PATH="${HOME}/.maestro/bin:${PATH}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "error: maestro not found. Run: npm run maestro:install" >&2
  exit 1
fi

if [[ -f "${ROOT}/.env.maestro" ]]; then
  load_maestro_env_literal "${ROOT}/.env.maestro"
else
  # Shell-exported MAESTRO_* / role aliases still resolve to EMAIL(_2).
  resolve_maestro_role_aliases
  resolve_maestro_launch_defaults
fi

# Android-only: never fall through to a local iOS Simulator when adb is empty.
SERIAL="$(maestro_resolve_android_serial)" || exit 1
export ANDROID_SERIAL="${SERIAL}"

# Default artifact dir when caller did not pass --test-output-dir.
# Maestro also writes under .maestro/test_output via config.yaml; scrub both.
STAMP="$(date +%Y-%m-%d_%H%M%S)"
DEFAULT_OUT="${ROOT}/test_output/${STAMP}"
HAS_OUT_DIR=0
ARGS=()
i=1
while [[ $i -le $# ]]; do
  arg="${!i}"
  if [[ "${arg}" == "--test-output-dir" ]]; then
    HAS_OUT_DIR=1
    ARGS+=("${arg}")
    i=$((i + 1))
    if [[ $i -le $# ]]; then
      ARGS+=("${!i}")
      DEFAULT_OUT="${!i}"
    fi
  else
    ARGS+=("${arg}")
  fi
  i=$((i + 1))
done

if [[ "${HAS_OUT_DIR}" -eq 0 ]]; then
  mkdir -p "${DEFAULT_OUT}"
  ARGS+=(--test-output-dir "${DEFAULT_OUT}")
fi

# Local Debug + emulator: keep host Metro reachable as 10.0.2.2:8081.
adb -s "${SERIAL}" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true

scrub_on_exit() {
  local code=$?
  bash "${ROOT}/scripts/maestro-scrub-artifacts.sh" "${DEFAULT_OUT}" || true
  if [[ -d "${ROOT}/.maestro/test_output" ]]; then
    bash "${ROOT}/scripts/maestro-scrub-artifacts.sh" "${ROOT}/.maestro/test_output" || true
  fi
  exit "${code}"
}
trap scrub_on_exit EXIT

maestro test -p android --device "${SERIAL}" "${ARGS[@]}"
