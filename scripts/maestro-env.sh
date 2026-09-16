#!/usr/bin/env bash
# Shared Maestro env helpers. Sourced by maestro-test.sh and wrappers.
# Loads `.env.maestro` literally (no Bash expansion) when present.
# Resolves translator / Account B aliases onto MAESTRO_EMAIL(_2) for flows + EAS.
# Account B = member-without-assignments (MAESTRO_PM_* aliases kept for local readability).

is_supported_maestro_env_key() {
  case "$1" in
    MAESTRO_EMAIL | MAESTRO_PASSWORD | MAESTRO_EMAIL_2 | MAESTRO_PASSWORD_2 | \
      MAESTRO_TRANSLATOR_EMAIL | MAESTRO_TRANSLATOR_PASSWORD | \
      MAESTRO_PM_EMAIL | MAESTRO_PM_PASSWORD | \
      MAESTRO_LAUNCH_MODE | MAESTRO_DEV_CLIENT_URL | \
      EXPO_PUBLIC_API_BASE_URL | EXPO_PUBLIC_E2E_MODE)
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

  resolve_maestro_role_aliases
}

# Map role aliases ↔ canonical MAESTRO_EMAIL(_2) without printing values.
# Canonical names win when both are set (EAS / existing docs stay stable).
resolve_maestro_role_aliases() {
  if [[ -z "${MAESTRO_EMAIL:-}" && -n "${MAESTRO_TRANSLATOR_EMAIL:-}" ]]; then
    export MAESTRO_EMAIL="${MAESTRO_TRANSLATOR_EMAIL}"
  fi
  if [[ -z "${MAESTRO_PASSWORD:-}" && -n "${MAESTRO_TRANSLATOR_PASSWORD:-}" ]]; then
    export MAESTRO_PASSWORD="${MAESTRO_TRANSLATOR_PASSWORD}"
  fi
  if [[ -z "${MAESTRO_EMAIL_2:-}" && -n "${MAESTRO_PM_EMAIL:-}" ]]; then
    export MAESTRO_EMAIL_2="${MAESTRO_PM_EMAIL}"
  fi
  if [[ -z "${MAESTRO_PASSWORD_2:-}" && -n "${MAESTRO_PM_PASSWORD:-}" ]]; then
    export MAESTRO_PASSWORD_2="${MAESTRO_PM_PASSWORD}"
  fi

  # Mirror canonical → aliases so flows may use either name.
  if [[ -z "${MAESTRO_TRANSLATOR_EMAIL:-}" && -n "${MAESTRO_EMAIL:-}" ]]; then
    export MAESTRO_TRANSLATOR_EMAIL="${MAESTRO_EMAIL}"
  fi
  if [[ -z "${MAESTRO_TRANSLATOR_PASSWORD:-}" && -n "${MAESTRO_PASSWORD:-}" ]]; then
    export MAESTRO_TRANSLATOR_PASSWORD="${MAESTRO_PASSWORD}"
  fi
  if [[ -z "${MAESTRO_PM_EMAIL:-}" && -n "${MAESTRO_EMAIL_2:-}" ]]; then
    export MAESTRO_PM_EMAIL="${MAESTRO_EMAIL_2}"
  fi
  if [[ -z "${MAESTRO_PM_PASSWORD:-}" && -n "${MAESTRO_PASSWORD_2:-}" ]]; then
    export MAESTRO_PM_PASSWORD="${MAESTRO_PASSWORD_2}"
  fi

  resolve_maestro_launch_defaults
}

# Launch mode: metro (Debug deep-link) | embedded (e2e-test / nightly APK, no Metro).
# Dev-client URL matches Expo automation deeplink docs (emulator + adb reverse).
resolve_maestro_launch_defaults() {
  if [[ -z "${MAESTRO_LAUNCH_MODE:-}" ]]; then
    export MAESTRO_LAUNCH_MODE=metro
  fi
  if [[ -z "${MAESTRO_DEV_CLIENT_URL:-}" ]]; then
    # Emulator → host: 10.0.2.2. Requires Metro bound to all interfaces (not --localhost / ::1).
    export MAESTRO_DEV_CLIENT_URL='exp+fluent-mobile://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081%3FdisableOnboarding%3D1&disableFab=1&disableAutoLaunch=1'
  fi
}
