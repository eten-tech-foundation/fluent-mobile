#!/usr/bin/env bash
# Post a Slack Incoming Webhook message for nightly preview builds.
# Env:
#   SLACK_WEBHOOK_URL — required to send; if unset, skips with warning
#   STATUS — success | failure | skipped
#   TRIGGER — schedule | workflow_dispatch | …
#   PLATFORM, PROFILE, BRANCH, SHA, AUTHOR, BUILD_DATE
#   APP_VERSION, VERSION_CODE, INSTALL_URL, BUILD_ID
#   CHANGELOG — multiline text
#   RUN_URL — GitHub Actions run URL
#   FAILED_STEP — optional (failure)
#   FEEDBACK_URL — optional issue / feedback link
#   API_BASE_URL — baked API URL (success)
#   NOTIFY_SLACK — "true" to send (default true); "false" skips send
#   SLACK_PAYLOAD_JSON — optional path to JSON written by write-slack-nightly-payload.sh
#   DRY_RUN — "true" prints the JSON payload and exits (no webhook)
# Incoming webhooks cannot mute phone push. STATUS=failure uses the same
# :zzz: / amber card as skipped so overnight misses do not look like incidents.
set -euo pipefail

if [ -n "${SLACK_PAYLOAD_JSON:-}" ] && [ -f "${SLACK_PAYLOAD_JSON}" ]; then
  eval "$(jq -r 'to_entries[] | select(.key != "pending") | "export \(.key)=\(.value|@sh)"' "${SLACK_PAYLOAD_JSON}")"
fi

NOTIFY_SLACK="${NOTIFY_SLACK:-true}"
if [ "${NOTIFY_SLACK}" != "true" ]; then
  echo "ℹ️ Slack notify disabled (NOTIFY_SLACK=${NOTIFY_SLACK})"
  exit 0
fi

STATUS="${STATUS:?STATUS is required}"
TRIGGER="${TRIGGER:-unknown}"
PLATFORM="${PLATFORM:-android}"
PROFILE="${PROFILE:-nightly}"
BRANCH="${BRANCH:-}"
SHA="${SHA:-}"
AUTHOR="${AUTHOR:-}"
BUILD_DATE="${BUILD_DATE:-}"
APP_VERSION="${APP_VERSION:-}"
VERSION_CODE="${VERSION_CODE:-}"
INSTALL_URL="${INSTALL_URL:-}"
BUILD_ID="${BUILD_ID:-}"
CHANGELOG="${CHANGELOG:-}"
RUN_URL="${RUN_URL:-}"
FAILED_STEP="${FAILED_STEP:-}"
API_BASE_URL="${API_BASE_URL:-https://dev.api.fluent.bible}"
FEEDBACK_URL="${FEEDBACK_URL:-https://github.com/eten-tech-foundation/fluent-mobile/issues/new}"

SHORT_SHA="${SHA:0:7}"
QR_URL=""
if [ -n "${INSTALL_URL}" ]; then
  QR_URL="https://quickchart.io/qr?size=256&margin=2&text=$(printf '%s' "${INSTALL_URL}" | jq -sRr @uri)"
fi

case "${STATUS}" in
  success)
    TITLE=":white_check_mark: Fluent nightly Android build ready"
    COLOR="#2eb886"
    DETAIL_LINES=$(cat <<EOF
*Status:* success (binary APK — no OTA)
*Platform:* ${PLATFORM}
*Environment:* development API (\`${API_BASE_URL}\`)
*EAS profile:* \`${PROFILE}\`
*Trigger:* ${TRIGGER}
*Branch:* \`${BRANCH}\`
*Commit:* \`${SHORT_SHA}\` (${AUTHOR})
*Build date:* ${BUILD_DATE}
*App version:* ${APP_VERSION}
*Native build number:* ${VERSION_CODE:-n/a}
*Install:* <${INSTALL_URL}|Download APK / open EAS build>
*Build id:* \`${BUILD_ID}\`
*Actions:* <${RUN_URL}|Workflow run>
*Feedback:* <${FEEDBACK_URL}|Open an issue>

*Changelog*
${CHANGELOG}
EOF
)
    if [ -n "${QR_URL}" ]; then
      DETAIL_LINES="${DETAIL_LINES}

QR (install page): ${QR_URL}"
    fi
    ;;
  failure)
    TITLE=":zzz: Fluent nightly skipped (no APK)"
    COLOR="#e8b339"
    DETAIL_NOTE="This run did not produce an APK. Details are in the Actions log."
    if [ -n "${FAILED_STEP}" ]; then
      DETAIL_NOTE="${DETAIL_NOTE} Look at \`${FAILED_STEP}\` if you want the specifics."
    fi
    DETAIL_LINES=$(cat <<EOF
*Status:* skipped
*Trigger:* ${TRIGGER}
*Branch:* \`${BRANCH}\`
*Commit:* \`${SHORT_SHA}\`
*Actions:* <${RUN_URL}|Workflow run>
${DETAIL_NOTE}
EOF
)
    ;;
  skipped)
    TITLE=":zzz: Fluent nightly skipped (no new commits)"
    COLOR="#e8b339"
    DETAIL_LINES=$(cat <<EOF
*Status:* skipped
*Trigger:* ${TRIGGER}
*Branch:* \`${BRANCH}\`
*Commit:* \`${SHORT_SHA}\` (same as last successful nightly)
*Actions:* <${RUN_URL}|Workflow run>
Use \`workflow_dispatch\` with \`force_build=true\` to build anyway.
EOF
)
    ;;
  *)
    echo "❌ Unknown STATUS=${STATUS}"
    exit 1
    ;;
esac

PAYLOAD=$(jq -n \
  --arg title "${TITLE}" \
  --arg color "${COLOR}" \
  --arg text "${DETAIL_LINES}" \
  '{
    text: $title,
    attachments: [
      {
        color: $color,
        mrkdwn_in: ["text"],
        text: $text
      }
    ]
  }')

if [ "${DRY_RUN:-}" = "true" ]; then
  printf '%s\n' "${PAYLOAD}"
  exit 0
fi

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  echo "⚠️ SLACK_WEBHOOK_URL not set — skipping Slack notification"
  exit 0
fi

HTTP_CODE=$(curl -sS -o /tmp/slack-nightly-response.txt -w "%{http_code}" \
  -X POST \
  -H 'Content-type: application/json' \
  --data "${PAYLOAD}" \
  "${SLACK_WEBHOOK_URL}")

if [ "${HTTP_CODE}" != "200" ]; then
  echo "❌ Slack webhook returned HTTP ${HTTP_CODE}"
  cat /tmp/slack-nightly-response.txt || true
  exit 1
fi

echo "✅ Slack notification sent (${STATUS})"
