#!/usr/bin/env bash
# Wrapper so IDE MCP configs get PATH + JAVA_HOME for the Maestro CLI MCP server.
set -euo pipefail

MAESTRO_HOME="${MAESTRO_HOME:-${HOME}/.maestro}"
export PATH="${MAESTRO_HOME}/bin:${PATH}"

if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -x /usr/libexec/java_home ]]; then
    JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null || true)"
    export JAVA_HOME
  fi
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "error: maestro not found. Run: npm run maestro:install" >&2
  exit 1
fi

exec maestro mcp "$@"
