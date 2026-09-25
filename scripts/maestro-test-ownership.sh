#!/usr/bin/env bash
# Ownership / claim Maestro suite (#574). Fail-fast on missing fixture env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=maestro-env.sh
source "${ROOT}/scripts/maestro-env.sh"

export PATH="${HOME}/.maestro/bin:${PATH}"

if [[ -f "${ROOT}/.env.maestro" ]]; then
  load_maestro_env_literal "${ROOT}/.env.maestro"
fi

missing=()
[[ -z "${MAESTRO_EMAIL:-}" ]] && missing+=("MAESTRO_EMAIL")
[[ -z "${MAESTRO_PASSWORD:-}" ]] && missing+=("MAESTRO_PASSWORD")
[[ -z "${MAESTRO_PM_EMAIL:-}" ]] && missing+=("MAESTRO_PM_EMAIL")
[[ -z "${MAESTRO_PM_PASSWORD:-}" ]] && missing+=("MAESTRO_PM_PASSWORD")
[[ -z "${MAESTRO_FIXTURE_PROJECT_NAME:-}" ]] && missing+=("MAESTRO_FIXTURE_PROJECT_NAME")
[[ -z "${MAESTRO_FIXTURE_MINE_LABEL:-}" ]] && missing+=("MAESTRO_FIXTURE_MINE_LABEL")
[[ -z "${MAESTRO_FIXTURE_OTHER_LABEL:-}" ]] && missing+=("MAESTRO_FIXTURE_OTHER_LABEL")
[[ -z "${MAESTRO_FIXTURE_UNASSIGNED_LABEL:-}" ]] && missing+=("MAESTRO_FIXTURE_UNASSIGNED_LABEL")
[[ -z "${MAESTRO_FIXTURE_CLAIM_LABEL:-}" ]] && missing+=("MAESTRO_FIXTURE_CLAIM_LABEL")

if ((${#missing[@]} > 0)); then
  echo "error: ownership suite requires credentials + fixture labels in env / .env.maestro:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  echo "See .env.maestro.example and docs/guides/maestro.md (#574)." >&2
  echo "Seed first: npm run maestro:fixtures:seed" >&2
  exit 1
fi

# Optional conflict / open Peer Check flows are excluded unless labels are set.
EXCLUDE_TAGS=()
OPTIONAL_EXCLUDES=()
if [[ -z "${MAESTRO_FIXTURE_CONFLICT_LABEL:-}" ]]; then
  OPTIONAL_EXCLUDES+=("ownership-conflict")
fi
if [[ -z "${MAESTRO_FIXTURE_OPEN_PEER_CHECK_LABEL:-}" ]]; then
  OPTIONAL_EXCLUDES+=("ownership-peer-check")
fi
if ((${#OPTIONAL_EXCLUDES[@]} > 0)); then
  IFS=,
  EXCLUDE_TAGS=(--exclude-tags "${OPTIONAL_EXCLUDES[*]}")
  unset IFS
fi

echo "Seeding ownership fixtures against API…"
# Local suite may rotate claim to the next pristine not_started chapter.
MAESTRO_FIXTURE_ALLOW_CLAIM_ROTATE=1 \
  node "${ROOT}/scripts/maestro-ownership-fixtures.mjs" seed

STATE_FILE="${ROOT}/.maestro/fixtures/ownership-claim.state.json"
if [[ -f "${STATE_FILE}" ]]; then
  CLAIM_FROM_STATE="$(node -e "const s=require('${STATE_FILE}'); process.stdout.write(s.roles?.claim||'')")"
  if [[ -n "${CLAIM_FROM_STATE}" ]]; then
    export MAESTRO_FIXTURE_CLAIM_LABEL="${CLAIM_FROM_STATE}"
    echo "Using seeded claim label: ${MAESTRO_FIXTURE_CLAIM_LABEL}"
  fi
fi

echo "Verifying ownership fixtures against API…"
node "${ROOT}/scripts/maestro-ownership-fixtures.mjs" verify

exec bash "${ROOT}/scripts/maestro-test.sh" \
  --config .maestro/config.yaml \
  --include-tags ownership \
  "${EXCLUDE_TAGS[@]}" \
  .maestro \
  "$@"
