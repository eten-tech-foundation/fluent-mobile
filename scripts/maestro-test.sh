#!/usr/bin/env bash
# Run Maestro with ~/.maestro/bin on PATH (same as doctor / MCP wrappers).
# Loads .env.maestro when present so MAESTRO_* / related keys reach Maestro.
# Values are parsed literally (no Bash expansion) — safe under `set -u`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.maestro/bin:${PATH}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "error: maestro not found. Run: npm run maestro:install" >&2
  exit 1
fi

# Supported keys from .env.maestro.example (plus commented multi-account pair).
is_supported_maestro_env_key() {
  case "$1" in
    MAESTRO_EMAIL | MAESTRO_PASSWORD | MAESTRO_EMAIL_2 | MAESTRO_PASSWORD_2 | EXPO_PUBLIC_API_BASE_URL | EXPO_PUBLIC_E2E_MODE)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# KEY=VALUE dotenv without `source` / eval — credentials stay literal text.
load_maestro_env_literal() {
  local env_file="$1"
  local line key value

  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue

    if [[ "${line}" == export[[:space:]]* ]]; then
      line="${line#export}"
      line="${line#"${line%%[![:space:]]*}"}"
    fi

    [[ "${line}" == *=* ]] || continue
    key="${line%%=*}"
    value="${line#*=}"

    # Trim key whitespace only (values stay literal aside from outer quotes).
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    is_supported_maestro_env_key "${key}" || continue

    if [[ "${value}" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
    elif [[ "${value}" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi

    export "${key}=${value}"
  done <"${env_file}"
}

if [[ -f "${ROOT}/.env.maestro" ]]; then
  load_maestro_env_literal "${ROOT}/.env.maestro"
fi

exec maestro test "$@"
