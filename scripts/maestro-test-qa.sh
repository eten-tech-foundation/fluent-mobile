#!/usr/bin/env bash
# Explicit QA Maestro entrypoint. Pins lane + .env.maestro.qa before any
# device/Maestro action. Dev stays on scripts/maestro-test.sh + .env.maestro.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export MAESTRO_ENV_LANE=qa

# Default to repo .env.maestro.qa. Allow only another path whose basename is
# exactly .env.maestro.qa (tests / alternate roots). Never accept .env.maestro.
if [[ -z "${MAESTRO_ENV_FILE:-}" ]]; then
  export MAESTRO_ENV_FILE="${ROOT}/.env.maestro.qa"
elif [[ "$(basename "${MAESTRO_ENV_FILE}")" != '.env.maestro.qa' ]]; then
  echo "error: QA entrypoint refuses env file $(basename "${MAESTRO_ENV_FILE}"); use .env.maestro.qa" >&2
  exit 2
fi

exec bash "${ROOT}/scripts/maestro-test.sh" "$@"
