#!/usr/bin/env bash
# Find the latest nightly-slack-payload artifact from the last 18h and post it
# if pending=true. Used by the 09:07 America/Los_Angeles Slack-only job.
set -euo pipefail

WORKDIR="${RUNNER_TEMP:-/tmp}/pending-slack"
mkdir -p "${WORKDIR}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUTOFF_EPOCH=$(($(date -u +%s) - 18 * 3600))
THIS_RUN="${GITHUB_RUN_ID:-}"

mapfile -t RUN_IDS < <(
  gh run list \
    --workflow=nightly-preview.yml \
    --branch main \
    --limit 30 \
    --json databaseId,createdAt,status \
    | jq -r --arg cutoff "${CUTOFF_EPOCH}" --arg this "${THIS_RUN}" \
      '.[]
        | select(.status == "completed")
        | select((.createdAt | fromdateiso8601) >= ($cutoff | tonumber))
        | select((.databaseId | tostring) != $this)
        | .databaseId'
)

if [ "${#RUN_IDS[@]}" -eq 0 ]; then
  echo "ℹ️ No completed Nightly Preview runs in the last 18h"
  exit 0
fi

for RUN_ID in "${RUN_IDS[@]}"; do
  DEST="${WORKDIR}/${RUN_ID}"
  rm -rf "${DEST}"
  mkdir -p "${DEST}"
  if ! gh run download "${RUN_ID}" --name nightly-slack-payload --dir "${DEST}" 2>/dev/null; then
    continue
  fi
  PAYLOAD="$(find "${DEST}" -name 'slack-payload.json' -print -quit)"
  if [ -z "${PAYLOAD}" ] || [ ! -f "${PAYLOAD}" ]; then
    continue
  fi
  PENDING="$(jq -r '.pending // false' "${PAYLOAD}")"
  if [ "${PENDING}" != "true" ]; then
    echo "ℹ️ Run ${RUN_ID} payload already delivered or not pending"
    continue
  fi
  echo "Delivering pending Slack payload from run ${RUN_ID}"
  SLACK_PAYLOAD_JSON="${PAYLOAD}" bash "${SCRIPT_DIR}/notify-slack-nightly.sh"
  exit 0
done

echo "ℹ️ No pending Slack payload in the last 18h"
