#!/usr/bin/env bash
# Fail-fast multi-account Maestro suite (#495). Requires both credential pairs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=maestro-env.sh
source "${ROOT}/scripts/maestro-env.sh"

export PATH="${HOME}/.maestro/bin:${PATH}"

if [[ -f "${ROOT}/.env.maestro" ]]; then
  load_maestro_env_literal "${ROOT}/.env.maestro"
else
  resolve_maestro_role_aliases
fi

missing=()
[[ -z "${MAESTRO_EMAIL:-}" ]] && missing+=("MAESTRO_EMAIL (Translator / MAESTRO_TRANSLATOR_EMAIL)")
[[ -z "${MAESTRO_PASSWORD:-}" ]] && missing+=("MAESTRO_PASSWORD (Translator / MAESTRO_TRANSLATOR_PASSWORD)")
[[ -z "${MAESTRO_EMAIL_2:-}" ]] && missing+=("MAESTRO_EMAIL_2 (Project Manager / MAESTRO_PM_EMAIL)")
[[ -z "${MAESTRO_PASSWORD_2:-}" ]] && missing+=("MAESTRO_PASSWORD_2 (Project Manager / MAESTRO_PM_PASSWORD)")

if ((${#missing[@]} > 0)); then
  echo "error: multi-account suite requires Account A (translator) + Account B (member-without-assignments) in env / .env.maestro:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  echo "See .env.maestro.example and docs/guides/maestro.md." >&2
  exit 1
fi

exec bash "${ROOT}/scripts/maestro-test.sh" \
  --config .maestro/config.yaml \
  --include-tags multi-account \
  .maestro \
  "$@"
