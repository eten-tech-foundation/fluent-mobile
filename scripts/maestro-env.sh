#!/usr/bin/env bash
# Shared Maestro env helpers. Sourced by maestro-test.sh and wrappers.
# Loads `.env.maestro` literally (no Bash expansion) when present.
# Resolves translator / Account B aliases onto MAESTRO_EMAIL(_2) for flows + EAS.
# Account B = member-without-assignments (MAESTRO_PM_* aliases kept for local readability).
# QA lane: scripts/maestro-test-qa.sh + .env.maestro.qa only; API base is pinned.

# Immutable QA API host for Maestro runner env (not Metro/app JS proof).
MAESTRO_QA_API_BASE_URL='https://qa.api.fluent.bible'
MAESTRO_QA_ENV_BASENAME='.env.maestro.qa'

is_supported_maestro_env_key() {
  case "$1" in
    MAESTRO_EMAIL | MAESTRO_PASSWORD | MAESTRO_EMAIL_2 | MAESTRO_PASSWORD_2 | \
      MAESTRO_TRANSLATOR_EMAIL | MAESTRO_TRANSLATOR_PASSWORD | \
      MAESTRO_PM_EMAIL | MAESTRO_PM_PASSWORD | \
      MAESTRO_LAUNCH_MODE | MAESTRO_DEV_CLIENT_URL | \
      EXPO_PUBLIC_API_BASE_URL | EXPO_PUBLIC_E2E_MODE | \
      MAESTRO_FIXTURE_PROJECT_NAME | MAESTRO_FIXTURE_PROJECT_ID | \
      MAESTRO_FIXTURE_MINE_LABEL | MAESTRO_FIXTURE_OTHER_LABEL | \
      MAESTRO_FIXTURE_UNASSIGNED_LABEL | MAESTRO_FIXTURE_CLAIM_LABEL | \
      MAESTRO_FIXTURE_CONFLICT_LABEL | MAESTRO_FIXTURE_OPEN_PEER_CHECK_LABEL | \
      MAESTRO_FIXTURE_CHAPTER_LABEL | MAESTRO_FIXTURE_CHAPTER_ID | \
      MAESTRO_FIXTURE_OTHER_USER_ID | \
      MAESTRO_FIXTURE_PROJECT_ALLOWLIST | MAESTRO_FIXTURE_PROJECT_DENYLIST | \
      MAESTRO_TRANSLATOR2_EMAIL | MAESTRO_TRANSLATOR2_PASSWORD | \
      MAESTRO_EMAIL_3 | MAESTRO_PASSWORD_3)
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

    # Do not clobber MAESTRO_FIXTURE_* already exported (ownership suite rotates
    # claim label after seed). Credentials / API URL still load from the env file
    # even when a stale shell export is present, unless MAESTRO_KEEP_EXPORTS=1
    # (parallel workers that exported their own account).
    # QA lane always takes EXPO_PUBLIC_API_BASE_URL from the QA file so a stale
    # Dev export cannot silently win before the pin/guard.
    if [[ "${key}" == MAESTRO_FIXTURE_* && -n "${!key:-}" ]]; then
      continue
    fi
    if [[ "${key}" == 'EXPO_PUBLIC_API_BASE_URL' && "${MAESTRO_ENV_LANE:-}" == 'qa' ]]; then
      export "${key}=${value}"
      continue
    fi
    if [[ "${MAESTRO_KEEP_EXPORTS:-}" == "1" && -n "${!key:-}" ]]; then
      continue
    fi

    export "${key}=${value}"
  done <"${env_file}"

  resolve_maestro_role_aliases
}

# Fail closed before adb/Maestro when MAESTRO_ENV_LANE=qa. Pins the immutable
# QA API base so shell KEEP_EXPORTS / wrong files / Maestro -e cannot keep Dev.
# Remaining args after the env file are forwarded as Maestro argv for -e checks.
assert_and_pin_maestro_qa_env() {
  local env_file="$1"
  shift
  local pinned
  if ! pinned="$(
    node "${ROOT}/scripts/maestro-env-guard.cjs" --assert-qa \
      --lane "${MAESTRO_ENV_LANE:-}" \
      --env-file "${env_file}" \
      -- "$@"
  )"; then
    return 2
  fi
  export EXPO_PUBLIC_API_BASE_URL="${pinned:-${MAESTRO_QA_API_BASE_URL}}"
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
