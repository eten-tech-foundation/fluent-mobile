#!/usr/bin/env bash
# Install an embedded JS APK (e2e-test / nightly shape) for Maestro without Metro.
# Usage:
#   MAESTRO_E2E_APK=/path/to/app.apk npm run maestro:android:e2e-up
# Or download the latest EAS e2e-test build (needs eas CLI + project access):
#   npm run maestro:android:e2e-up -- --eas
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=maestro-common.sh
source "${ROOT}/scripts/maestro-common.sh"

APP_ID="com.eten.fluent"
export PATH="${HOME}/.maestro/bin:${PATH}"

SERIAL="$(maestro_resolve_android_serial)"
export ANDROID_SERIAL="${SERIAL}"
echo "==> device: ${SERIAL}"

APK="${MAESTRO_E2E_APK:-}"
if [[ "${1:-}" == "--eas" ]]; then
  echo "==> Resolving latest EAS e2e-test Android APK..."
  STAGE="$(mktemp -d "${TMPDIR:-/tmp}/maestro-e2e-apk.XXXXXX")"
  # eas build:download needs a build id; list finished e2e-test builds
  BUILD_JSON="$(npx --yes eas-cli@24.3.0 build:list --platform android --profile e2e-test --status finished --limit 1 --json --non-interactive 2>/dev/null || true)"
  BUILD_ID="$(printf '%s' "${BUILD_JSON}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["id"] if isinstance(d,list) and d else "")' 2>/dev/null || true)"
  if [[ -z "${BUILD_ID}" ]]; then
    echo "error: no finished e2e-test build found. Run: npm run maestro:eas -- -F suite=harness" >&2
    echo "  or pass MAESTRO_E2E_APK=/path/to.apk" >&2
    exit 1
  fi
  echo "  build_id=${BUILD_ID}"
  (cd "${STAGE}" && npx --yes eas-cli@24.3.0 build:download --id "${BUILD_ID}" --non-interactive)
  APK="$(find "${STAGE}" -name '*.apk' | head -1)"
fi

if [[ -z "${APK}" || ! -f "${APK}" ]]; then
  echo "error: set MAESTRO_E2E_APK to an embedded APK path, or pass --eas" >&2
  echo "  MAESTRO_E2E_APK=./app-release.apk npm run maestro:android:e2e-up" >&2
  exit 1
fi

echo "==> Installing ${APK}"
adb -s "${SERIAL}" install -r "${APK}"
echo "==> Export for this shell (also add to .env.maestro):"
echo "  MAESTRO_LAUNCH_MODE=embedded"
echo ""
echo "OK: embedded APK ready. Run flows without Metro:"
echo "  MAESTRO_LAUNCH_MODE=embedded npm run maestro:test:harness"
echo "  MAESTRO_LAUNCH_MODE=embedded npm run maestro:test:stage1 -- 5"
