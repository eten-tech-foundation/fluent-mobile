#!/usr/bin/env bash
# Always start a new Android EAS build (no fingerprint reuse).
# Requires: eas CLI (expo-github-action) or npx eas-cli, jq, GITHUB_OUTPUT.
#
# Env:
#   PROFILE — eas.json build profile (default: nightly)
#   MESSAGE — eas build message (required)
set -euo pipefail

if command -v eas >/dev/null 2>&1; then
  EAS=(eas)
else
  EAS=(npx --yes eas-cli@latest)
fi

PROFILE="${PROFILE:-nightly}"
MESSAGE="${MESSAGE:?MESSAGE is required}"

echo "Starting new EAS Android build (profile: ${PROFILE}) — binary only, no OTA..."

BUILD_OUTPUT=$(
  "${EAS[@]}" build \
    --platform android \
    --profile "${PROFILE}" \
    --message "${MESSAGE}" \
    --json \
    --non-interactive \
    --wait
)

BUILD_ID=$(echo "${BUILD_OUTPUT}" | jq -r '
  if type == "array" then (.[-1].id // .[0].id // empty) else (.id // empty) end
')

if [ -z "${BUILD_ID}" ] || [ "${BUILD_ID}" = "null" ]; then
  echo "❌ Could not parse EAS build id from output"
  echo "${BUILD_OUTPUT}" | tail -n 40
  exit 1
fi

BUILD_STATUS=$(echo "${BUILD_OUTPUT}" | jq -r '
  if type == "array" then (.[-1].status // .[0].status // empty) else (.status // empty) end
')

APP_VERSION=$(echo "${BUILD_OUTPUT}" | jq -r '
  if type == "array" then (.[-1].appVersion // .[0].appVersion // empty) else (.appVersion // empty) end
')

VERSION_CODE=$(echo "${BUILD_OUTPUT}" | jq -r '
  if type == "array" then (.[-1].appBuildVersion // .[0].appBuildVersion // empty) else (.appBuildVersion // empty) end
')

if [ "${BUILD_STATUS}" = "ERRORED" ] || [ "${BUILD_STATUS}" = "CANCELED" ]; then
  echo "❌ Build ${BUILD_ID} finished with status ${BUILD_STATUS}"
  exit 1
fi

INSTALL_URL="https://expo.dev/builds/${BUILD_ID}"

echo "✅ Nightly build ready: ${BUILD_ID} (${BUILD_STATUS})"
echo "   Install: ${INSTALL_URL}"

{
  echo "build_id=${BUILD_ID}"
  echo "build_status=${BUILD_STATUS}"
  echo "install_url=${INSTALL_URL}"
  echo "app_version=${APP_VERSION}"
  echo "version_code=${VERSION_CODE}"
} >> "${GITHUB_OUTPUT}"
