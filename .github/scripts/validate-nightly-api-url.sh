#!/usr/bin/env bash
# Fail if the nightly EAS profile would bake a non-dev / production-like API URL.
# Requires: jq, eas.json at repo root.
set -euo pipefail

EXPECTED_URL="${EXPECTED_DEV_API_URL:-https://dev.api.fluent.bible}"
EAS_JSON="${EAS_JSON_PATH:-eas.json}"

if [ ! -f "${EAS_JSON}" ]; then
  echo "❌ Missing ${EAS_JSON}"
  exit 1
fi

URL=$(jq -r '.build.nightly.env.EXPO_PUBLIC_API_BASE_URL // empty' "${EAS_JSON}")

if [ -z "${URL}" ]; then
  echo "❌ eas.json build.nightly.env.EXPO_PUBLIC_API_BASE_URL is missing"
  exit 1
fi

if [ "${URL}" != "${EXPECTED_URL}" ]; then
  echo "❌ Nightly API URL must be exactly ${EXPECTED_URL}"
  echo "   Found: ${URL}"
  exit 1
fi

# Extra guard: reject hostnames that look like production (no "dev." subdomain).
HOST=$(printf '%s' "${URL}" | sed -E 's|^https?://([^/]+).*|\1|')
case "${HOST}" in
  dev.api.fluent.bible) ;;
  *api.fluent.bible*)
    echo "❌ Nightly API host looks like production: ${HOST}"
    exit 1
    ;;
esac

echo "✅ Nightly API URL OK: ${URL}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "api_base_url=${URL}" >> "${GITHUB_OUTPUT}"
fi
