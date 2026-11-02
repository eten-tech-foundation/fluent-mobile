#!/usr/bin/env bash
# Run Stage 1 critical flows (optionally N passes for stability).
# Each pass is one Maestro invocation, so a failing flow does not skip the rest
# of that pass. MAESTRO_ENV_LANE=qa routes through scripts/maestro-test-qa.sh.
# Usage: maestro-test-stage1.sh [repeats=1]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPEATS="${1:-1}"
if [[ ! "${REPEATS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "error: repeats must be a positive integer (got '${REPEATS}')" >&2
  exit 2
fi

FLOWS=(
  .maestro/flows/harness/launch.yaml
  .maestro/flows/auth/login-happy-path.yaml
  .maestro/flows/auth/session-restore.yaml
  .maestro/flows/navigation/my-work-to-drafting.yaml
)

need_b=0
# shellcheck source=maestro-env.sh
source "${ROOT}/scripts/maestro-env.sh"
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
else
  ENV_FILE="${MAESTRO_ENV_FILE:-${ROOT}/.env.maestro}"
  if [[ -n "${MAESTRO_EMAIL_2:-}" || -n "${MAESTRO_PM_EMAIL:-}" || -n "${MAESTRO_PM_PASSWORD:-}" || -f "${ENV_FILE}" ]]; then
    if [[ -f "${ENV_FILE}" ]]; then
      load_maestro_env_literal "${ENV_FILE}"
    else
      resolve_maestro_role_aliases
    fi
  fi
fi
if [[ -n "${MAESTRO_EMAIL_2:-}" && -n "${MAESTRO_PASSWORD_2:-}" ]]; then
  FLOWS+=(.maestro/flows/navigation/empty-assignments.yaml)
  need_b=1
fi

RUNNER="${ROOT}/scripts/maestro-test.sh"
if [[ "${MAESTRO_ENV_LANE:-}" == 'qa' ]]; then
  assert_and_pin_maestro_qa_env "${ENV_FILE}" --config .maestro/config.yaml "${FLOWS[@]}" || exit 2
  RUNNER="${ROOT}/scripts/maestro-test-qa.sh"
fi

echo "==> Stage 1: ${#FLOWS[@]} flows × ${REPEATS} (Account B included=${need_b})"
for ((i = 1; i <= REPEATS; i++)); do
  echo "==> Pass ${i}/${REPEATS}"
  bash "${RUNNER}" --config .maestro/config.yaml "${FLOWS[@]}"
done
echo "OK: Stage 1 complete (${REPEATS}×)"
