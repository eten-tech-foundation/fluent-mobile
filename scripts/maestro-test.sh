#!/usr/bin/env bash
# Run Maestro with ~/.maestro/bin on PATH (same as doctor / MCP wrappers).
# Loads .env.maestro when present so MAESTRO_* / related keys reach Maestro.
# Values are parsed literally (no Bash expansion) — safe under `set -u`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=maestro-env.sh
source "${ROOT}/scripts/maestro-env.sh"

export PATH="${HOME}/.maestro/bin:${PATH}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "error: maestro not found. Run: npm run maestro:install" >&2
  exit 1
fi

if [[ -f "${ROOT}/.env.maestro" ]]; then
  load_maestro_env_literal "${ROOT}/.env.maestro"
fi

exec maestro test "$@"
