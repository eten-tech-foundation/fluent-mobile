#!/usr/bin/env bash
# Run Maestro with ~/.maestro/bin on PATH (same as doctor / MCP wrappers).
# Sources .env.maestro when present so MAESTRO_EMAIL / MAESTRO_PASSWORD are available.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.maestro/bin:${PATH}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "error: maestro not found. Run: npm run maestro:install" >&2
  exit 1
fi

if [[ -f "${ROOT}/.env.maestro" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env.maestro"
  set +a
fi

exec maestro test "$@"
