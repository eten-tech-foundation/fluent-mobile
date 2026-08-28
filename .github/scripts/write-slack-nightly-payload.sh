#!/usr/bin/env bash
# Write a JSON payload that notify-slack-nightly.sh can replay later.
# Env: SLACK_PAYLOAD_OUT (path), SLACK_PENDING (true|false), plus notify-slack fields.
set -euo pipefail

OUT="${SLACK_PAYLOAD_OUT:?SLACK_PAYLOAD_OUT is required}"
PENDING="${SLACK_PENDING:-true}"

jq -n \
  --arg pending "${PENDING}" \
  --arg STATUS "${STATUS:?STATUS is required}" \
  --arg TRIGGER "${TRIGGER:-unknown}" \
  --arg PLATFORM "${PLATFORM:-android}" \
  --arg PROFILE "${PROFILE:-nightly}" \
  --arg BRANCH "${BRANCH:-}" \
  --arg SHA "${SHA:-}" \
  --arg AUTHOR "${AUTHOR:-}" \
  --arg BUILD_DATE "${BUILD_DATE:-}" \
  --arg APP_VERSION "${APP_VERSION:-}" \
  --arg VERSION_CODE "${VERSION_CODE:-}" \
  --arg INSTALL_URL "${INSTALL_URL:-}" \
  --arg BUILD_ID "${BUILD_ID:-}" \
  --arg CHANGELOG "${CHANGELOG:-}" \
  --arg RUN_URL "${RUN_URL:-}" \
  --arg FAILED_STEP "${FAILED_STEP:-}" \
  --arg API_BASE_URL "${API_BASE_URL:-https://dev.api.fluent.bible}" \
  --arg FEEDBACK_URL "${FEEDBACK_URL:-https://github.com/eten-tech-foundation/fluent-mobile/issues/new}" \
  '{
    pending: ($pending == "true"),
    STATUS: $STATUS,
    TRIGGER: $TRIGGER,
    PLATFORM: $PLATFORM,
    PROFILE: $PROFILE,
    BRANCH: $BRANCH,
    SHA: $SHA,
    AUTHOR: $AUTHOR,
    BUILD_DATE: $BUILD_DATE,
    APP_VERSION: $APP_VERSION,
    VERSION_CODE: $VERSION_CODE,
    INSTALL_URL: $INSTALL_URL,
    BUILD_ID: $BUILD_ID,
    CHANGELOG: $CHANGELOG,
    RUN_URL: $RUN_URL,
    FAILED_STEP: $FAILED_STEP,
    API_BASE_URL: $API_BASE_URL,
    FEEDBACK_URL: $FEEDBACK_URL
  }' > "${OUT}"

echo "Wrote Slack payload (${STATUS}, pending=${PENDING}) to ${OUT}"
