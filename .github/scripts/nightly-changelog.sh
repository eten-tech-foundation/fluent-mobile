#!/usr/bin/env bash
# Emit a short changelog between PREV_SHA (exclusive) and HEAD (inclusive).
# Writes multiline output to GITHUB_OUTPUT key "changelog" when set.
# Env:
#   PREV_SHA — prior successful nightly head SHA (optional; empty = last N commits)
#   MAX_LINES — max commit lines (default 15)
set -euo pipefail

MAX_LINES="${MAX_LINES:-15}"
PREV_SHA="${PREV_SHA:-}"

if [ -n "${PREV_SHA}" ] && git rev-parse --verify "${PREV_SHA}^{commit}" >/dev/null 2>&1; then
  HEADER="Commits since last successful nightly (\`${PREV_SHA:0:7}\`):"
  LOG=$(git log "${PREV_SHA}..HEAD" --pretty=format:'- %h %s (%an)' 2>/dev/null || true)
else
  HEADER="Recent commits (no prior successful nightly SHA):"
  LOG=$(git log -n "${MAX_LINES}" --pretty=format:'- %h %s (%an)' 2>/dev/null || true)
fi

if [ -z "${LOG}" ]; then
  LOG='_(no new commits)_'
fi

LINE_COUNT=$(printf '%s\n' "${LOG}" | wc -l | tr -d ' ')
if [ "${LINE_COUNT}" -gt "${MAX_LINES}" ]; then
  LOG=$(printf '%s\n' "${LOG}" | head -n "${MAX_LINES}")
  LOG="${LOG}
- … (${LINE_COUNT} total, truncated)"
fi

CHANGELOG="${HEADER}
${LOG}"

echo "${CHANGELOG}"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "changelog<<EOF"
    echo "${CHANGELOG}"
    echo "EOF"
  } >> "${GITHUB_OUTPUT}"
fi
