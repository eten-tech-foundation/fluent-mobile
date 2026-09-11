#!/usr/bin/env bash
# Run Maestro with ~/.maestro/bin on PATH (same as doctor / MCP wrappers).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.maestro/bin:${PATH}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "error: maestro not found. Run: npm run maestro:install" >&2
  exit 1
fi

exec maestro test "$@"
