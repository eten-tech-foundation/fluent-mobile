#!/usr/bin/env bash
# Run Stage 1 critical flows once, in one Maestro invocation.
# Maestro reports every flow; a failure does not skip the rest.
# Usage: maestro-test-stage1.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" != "" ]]; then
  echo "note: stage1 repeat counts are no longer supported; running once." >&2
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
  assert_and_pin_maestro_qa_env "${ENV_FILE}" --config .maestro/config.yaml "${FLOWS[@]}" || exit 2
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

echo "==> Stage 1: ${#FLOWS[@]} flows, one invocation (Account B included=${need_b})"
# QA stage1: use the QA entrypoint so lane + pin cannot be dropped.
if [[ "${MAESTRO_ENV_LANE:-}" == 'qa' ]]; then
  bash "${ROOT}/scripts/maestro-test-qa.sh" --config .maestro/config.yaml "${FLOWS[@]}"
else
  bash "${ROOT}/scripts/maestro-test.sh" --config .maestro/config.yaml "${FLOWS[@]}"
fi
echo "OK: Stage 1 complete"
