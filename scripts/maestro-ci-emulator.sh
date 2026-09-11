#!/usr/bin/env bash
# Invoked as a *single line* by android-emulator-runner (that action runs each
# `script:` line via `/usr/bin/sh -c`, so multiline YAML scripts break).
# Expects: repo root CWD, ANDROID_HOME from emulator-runner, MAESTRO_SUITE set.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.maestro/bin:${PATH}"

chmod +x android/gradlew
(
  cd android
  ./gradlew :app:assembleRelease --no-daemon -PreactNativeArchitectures=x86_64
)

APK="android/app/build/outputs/apk/release/app-release.apk"
test -f "${APK}"
adb install -r "${APK}"

mkdir -p .maestro/test_output
suite="${MAESTRO_SUITE:?MAESTRO_SUITE is required (harness|smokes|multi-account)}"

case "${suite}" in
  harness)
    npm run maestro:test:harness -- --format junit --output .maestro/test_output/report.xml
    ;;
  smokes)
    npm run maestro:test:smokes -- --format junit --output .maestro/test_output/report.xml
    ;;
  multi-account)
    npm run maestro:test:multi-account -- --format junit --output .maestro/test_output/report.xml
    ;;
  *)
    echo "Unknown MAESTRO_SUITE: ${suite}" >&2
    exit 1
    ;;
esac

adb logcat -d > .maestro/test_output/logcat.txt || true
