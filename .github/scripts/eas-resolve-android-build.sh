#!/usr/bin/env bash
# Resolve a reusable Android EAS build or start a new one.
# Requires: eas CLI (expo-github-action), jq, GITHUB_OUTPUT.
#
# Env:
#   PROFILE          — eas.json build profile (required)
#   MESSAGE          — eas build message (required)
#   BAKE_VERSION     — optional APP_VERSION_FALLBACK to bake before fingerprint
#   RUNTIME_VERSION  — optional runtime match fallback (js-only QA install)
#   ALLOW_RUNTIME_MATCH — "true" to reuse by runtime when fingerprint differs
#   WAIT_FOR_BUILD   — "true" to pass --wait when starting a new build
#   POLL_IN_PROGRESS — "true" to wait for matching in-progress builds

set -euo pipefail

PROFILE="${PROFILE:?PROFILE is required}"
MESSAGE="${MESSAGE:?MESSAGE is required}"
BAKE_VERSION="${BAKE_VERSION:-}"
RUNTIME_VERSION="${RUNTIME_VERSION:-}"
ALLOW_RUNTIME_MATCH="${ALLOW_RUNTIME_MATCH:-false}"
WAIT_FOR_BUILD="${WAIT_FOR_BUILD:-true}"
POLL_IN_PROGRESS="${POLL_IN_PROGRESS:-true}"
MAX_WAIT_IN_PROGRESS_SEC="${MAX_WAIT_IN_PROGRESS_SEC:-1800}"

if [ -n "$BAKE_VERSION" ]; then
  sed -i "s/^const APP_VERSION_FALLBACK = '[^']*'/const APP_VERSION_FALLBACK = '${BAKE_VERSION}'/" app.config.ts
  echo "Baked APP_VERSION_FALLBACK=${BAKE_VERSION}"
fi

echo "Computing Android fingerprint..."
FINGERPRINT_HASH=$(
  npx @expo/fingerprint fingerprint:generate --platform android 2>/dev/null | jq -r '.hash'
)
echo "fingerprint_hash=${FINGERPRINT_HASH}" >> "${GITHUB_OUTPUT}"

normalize_builds() {
  jq -r '(if type == "array" then . else .builds // [] end)'
}

list_builds() {
  local status="$1"
  npx eas build:list \
    -p android \
    -e "${PROFILE}" \
    --status "${status}" \
    --limit 25 \
    --json \
    --non-interactive 2>/dev/null | normalize_builds
}

match_build() {
  local json="$1"
  if [ "${ALLOW_RUNTIME_MATCH}" = "true" ]; then
    echo "${json}" | jq -r --arg fp "${FINGERPRINT_HASH}" --arg rv "${RUNTIME_VERSION}" '
      [.[] | select(
        ((.fingerprintHash // .fingerprint_hash // "") == $fp)
        or (($rv != "") and ((.runtimeVersion // .runtime_version // "") == $rv))
      )] | .[0].id // empty
    '
  else
    echo "${json}" | jq -r --arg fp "${FINGERPRINT_HASH}" '
      [.[] | select((.fingerprintHash // .fingerprint_hash // "") == $fp)]
      | .[0].id // empty
    '
  fi
}

BUILD_ID=""
INSTALL_SOURCE=""

if [ "${POLL_IN_PROGRESS}" = "true" ]; then
  IN_PROGRESS_JSON=$(list_builds "in-progress" || echo "[]")
  IP_BUILD_ID=$(match_build "${IN_PROGRESS_JSON}")
  if [ -n "${IP_BUILD_ID}" ]; then
    echo "⏳ Matching build already in progress: ${IP_BUILD_ID}"
    deadline=$((SECONDS + MAX_WAIT_IN_PROGRESS_SEC))
    while [ "${SECONDS}" -lt "${deadline}" ]; do
      status=$(list_builds "in-progress" | jq -r --arg id "${IP_BUILD_ID}" '.[] | select(.id == $id) | .status' | head -n 1)
      finished=$(list_builds "finished" | jq -r --arg id "${IP_BUILD_ID}" '.[] | select(.id == $id) | .id' | head -n 1)
      if [ -n "${finished}" ]; then
        BUILD_ID="${IP_BUILD_ID}"
        INSTALL_SOURCE="waited"
        echo "✅ In-progress build finished: ${BUILD_ID}"
        break
      fi
      if [ "${status}" = "ERRORED" ] || [ "${status}" = "CANCELED" ]; then
        echo "In-progress build ${status}; will start a new one if needed"
        break
      fi
      sleep 30
    done
  fi
fi

if [ -z "${BUILD_ID}" ]; then
  FINISHED_JSON=$(list_builds "finished" || echo "[]")
  BUILD_ID=$(match_build "${FINISHED_JSON}")
  if [ -n "${BUILD_ID}" ]; then
    INSTALL_SOURCE="existing"
    echo "✅ Reusing finished build: ${BUILD_ID}"
  fi
fi

if [ -z "${BUILD_ID}" ]; then
  echo "Starting new EAS build (profile: ${PROFILE})..."
  BUILD_ARGS=(
    --platform android
    --profile "${PROFILE}"
    --message "${MESSAGE}"
    --json
    --non-interactive
  )
  if [ "${WAIT_FOR_BUILD}" = "true" ]; then
    BUILD_ARGS+=(--wait)
  fi
  BUILD_OUTPUT=$(npx eas build "${BUILD_ARGS[@]}")
  BUILD_ID=$(echo "${BUILD_OUTPUT}" | jq -r '
    if type == "array" then (.[-1].id // .[0].id // empty) else (.id // empty) end
  ')
  INSTALL_SOURCE="created"

  if [ "${WAIT_FOR_BUILD}" != "true" ] && [ -n "${BUILD_ID}" ]; then
    echo "⏳ Waiting for new build ${BUILD_ID} to finish..."
    deadline=$((SECONDS + MAX_WAIT_IN_PROGRESS_SEC))
    while [ "${SECONDS}" -lt "${deadline}" ]; do
      BUILD_VIEW=$(
        npx eas build:view "${BUILD_ID}" --json --non-interactive 2>/dev/null || echo "{}"
      )
      BUILD_STATUS=$(echo "${BUILD_VIEW}" | jq -r '.status // empty')
      if [ "${BUILD_STATUS}" = "FINISHED" ]; then
        INSTALL_SOURCE="waited"
        echo "✅ New build finished: ${BUILD_ID}"
        break
      fi
      if [ "${BUILD_STATUS}" = "ERRORED" ] || [ "${BUILD_STATUS}" = "CANCELED" ]; then
        echo "❌ Build ${BUILD_ID} ${BUILD_STATUS}"
        exit 1
      fi
      sleep 30
    done
    if [ "${INSTALL_SOURCE}" != "waited" ]; then
      echo "❌ Timed out waiting for build ${BUILD_ID}"
      exit 1
    fi
  fi
fi

if [ -z "${BUILD_ID}" ] || [ "${BUILD_ID}" = "null" ]; then
  echo "❌ Could not resolve Android build"
  exit 1
fi

{
  echo "build_id=${BUILD_ID}"
  echo "install_url=https://expo.dev/builds/${BUILD_ID}"
  echo "install_source=${INSTALL_SOURCE}"
} >> "${GITHUB_OUTPUT}"
