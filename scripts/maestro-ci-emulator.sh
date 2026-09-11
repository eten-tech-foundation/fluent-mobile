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

# Maestro CLI report flags (docs.maestro.dev). On pinned 2.10.0, --test-output-dir
# owns session logs/screenshots; --debug-output is ignored when test-output-dir is set.
# CLI --test-output-dir overrides config.yaml; use .maestro/test_output so artifacts
# match GHA upload paths and .gitignore (config `test_output` alone is CWD-relative).
maestro_report_args=(
  --format junit
  --output .maestro/test_output/report.xml
  --test-output-dir .maestro/test_output
)

case "${suite}" in
  harness)
    npm run maestro:test:harness -- "${maestro_report_args[@]}"
    ;;
  smokes)
    npm run maestro:test:smokes -- "${maestro_report_args[@]}"
    ;;
  multi-account)
    npm run maestro:test:multi-account -- "${maestro_report_args[@]}"
    ;;
  *)
    echo "Unknown MAESTRO_SUITE: ${suite}" >&2
    exit 1
    ;;
esac

adb logcat -d > .maestro/test_output/logcat.txt || true
