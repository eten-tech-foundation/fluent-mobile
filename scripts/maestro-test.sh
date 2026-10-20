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

# Dev (default): .env.maestro. QA: scripts/maestro-test-qa.sh sets LANE=qa + .env.maestro.qa.
if [[ "${MAESTRO_ENV_LANE:-}" == 'qa' ]]; then
  ENV_FILE="${MAESTRO_ENV_FILE:-${ROOT}/.env.maestro.qa}"
  if [[ "$(basename "${ENV_FILE}")" != "${MAESTRO_QA_ENV_BASENAME}" ]]; then
    echo "error: QA lane refuses env file $(basename "${ENV_FILE}"); use ${MAESTRO_QA_ENV_BASENAME}" >&2
    exit 2
  fi
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "error: QA env file missing. Copy .env.maestro.qa.example to .env.maestro.qa" >&2
    exit 2
  fi
  load_maestro_env_literal "${ENV_FILE}"
  # Refuse file/shell/CLI base overrides before fixture preflight and adb.
  assert_and_pin_maestro_qa_env "${ENV_FILE}" "$@" || exit 2
else
  ENV_FILE="${MAESTRO_ENV_FILE:-${ROOT}/.env.maestro}"
  if [[ -f "${ENV_FILE}" ]]; then
    load_maestro_env_literal "${ENV_FILE}"
  else
    # Shell-exported MAESTRO_* / role aliases still resolve to EMAIL(_2).
    resolve_maestro_role_aliases
    resolve_maestro_launch_defaults
  fi
fi

# Missing fixture chapter is BLOCKED before adb start-server / device selection.
set +e
node "${ROOT}/scripts/maestro-fixture-guard.cjs" --preflight -- "$@"
preflight_status=$?
set -e
if [[ "${preflight_status}" -ne 0 ]]; then
  exit "${preflight_status}"
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "error: maestro not found. Run: npm run maestro:install" >&2
  exit 1
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
