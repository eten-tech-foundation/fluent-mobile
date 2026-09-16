#!/usr/bin/env bash
# Run Stage 1 critical flows (optionally N times each for stability).
# Usage: maestro-test-stage1.sh [repeats=1]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPEATS="${1:-1}"
FLOWS=(
  .maestro/flows/harness/launch.yaml
  .maestro/flows/auth/login-happy-path.yaml
  .maestro/flows/auth/session-restore.yaml
  .maestro/flows/navigation/my-work-to-drafting.yaml
)

need_b=0
if [[ -n "${MAESTRO_EMAIL_2:-}" || -f "${ROOT}/.env.maestro" ]]; then
  # shellcheck source=maestro-env.sh
  source "${ROOT}/scripts/maestro-env.sh"
  if [[ -f "${ROOT}/.env.maestro" ]]; then
    load_maestro_env_literal "${ROOT}/.env.maestro"
  else
    resolve_maestro_role_aliases
  fi
  if [[ -n "${MAESTRO_EMAIL_2:-}" && -n "${MAESTRO_PASSWORD_2:-}" ]]; then
    FLOWS+=(.maestro/flows/navigation/empty-assignments.yaml)
    need_b=1
  fi
fi

echo "==> Stage 1: ${#FLOWS[@]} flows × ${REPEATS} (Account B included=${need_b})"
for ((i = 1; i <= REPEATS; i++)); do
  echo "==> Pass ${i}/${REPEATS}"
  for flow in "${FLOWS[@]}"; do
    echo "--> ${flow}"
    bash "${ROOT}/scripts/maestro-test.sh" --config .maestro/config.yaml "${flow}"
  done
done
echo "OK: Stage 1 complete (${REPEATS}×)"
