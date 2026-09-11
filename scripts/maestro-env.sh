#!/usr/bin/env bash
# Shared Maestro env helpers. Sourced by maestro-test.sh and wrappers.
# Loads `.env.maestro` literally (no Bash expansion) when present.

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
