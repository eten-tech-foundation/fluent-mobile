#!/usr/bin/env bash
# Post a short Maestro results summary to Slack from EAS after_maestro_tests.
# Uses SLACK_WEBHOOK_URL when present (EAS preview secret). Never prints MAESTRO_* secrets.
# Args: $1 = $MAESTRO_TESTS_DIR from the Maestro job hook.
set -euo pipefail

TESTS_DIR="${1:-}"
WEBHOOK="${SLACK_WEBHOOK_URL:-}"

if [[ -z "${WEBHOOK}" ]]; then
  echo "SLACK_WEBHOOK_URL unset — skipping Slack summary."
  exit 0
fi

junit_count=0
fail_hint="unknown"
if [[ -n "${TESTS_DIR}" && -d "${TESTS_DIR}" ]]; then
  junit_count="$(find "${TESTS_DIR}" -name '*.xml' 2>/dev/null | wc -l | tr -d ' ')"
  if grep -R -l 'failures="[1-9]' "${TESTS_DIR}" --include='*.xml' >/dev/null 2>&1; then
    fail_hint="failures present in junit"
  elif grep -R -l 'errors="[1-9]' "${TESTS_DIR}" --include='*.xml' >/dev/null 2>&1; then
    fail_hint="errors present in junit"
  else
    fail_hint="no failure attributes found"
  fi
fi

text="Fluent Mobile Maestro (EAS): artifacts_dir=${TESTS_DIR:-none} junit_files=${junit_count} status_hint=${fail_hint}. See EAS Insights Maestro tab for pass/flake rates."

payload="$(printf '{"text":%s}' "$(printf '%s' "${text}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")"

curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
  -X POST -H 'Content-type: application/json' \
  --data "${payload}" \
  "${WEBHOOK}" >/dev/null

echo "OK: Slack Maestro summary posted."
