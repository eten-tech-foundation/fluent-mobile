#!/usr/bin/env bash
# Maestro informational CI helper (#510 / #497).
#
# Phases:
#   assemble — build release APK (run *before* android-emulator-runner so Gradle
#              does not share the runner with a live emulator).
#   run      — adb install + Maestro suite (single-line invoke for emulator-runner;
#              that action runs each `script:` line via `/usr/bin/sh -c`).
#
# Expects: repo root CWD (or resolves via ROOT), ANDROID_HOME/SDK available,
# MAESTRO_SUITE set for `run`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

phase="${1:?usage: $0 assemble|run}"
APK="android/app/build/outputs/apk/release/app-release.apk"

case "${phase}" in
  assemble)
    chmod +x android/gradlew
    (
      cd android
      ./gradlew :app:assembleRelease --no-daemon -PreactNativeArchitectures=x86_64
    )
    test -f "${APK}"
    echo "Assembled ${APK}"
    ;;
  run)
    export PATH="${HOME}/.maestro/bin:${PATH}"
    test -f "${APK}"
    adb install -r "${APK}"

    mkdir -p .maestro/test_output
    suite="${MAESTRO_SUITE:?MAESTRO_SUITE is required (harness|smokes|multi-account)}"

    # Maestro CLI report flags (docs.maestro.dev). On pinned 2.10.0,
    # --test-output-dir owns session logs; --debug-output is ignored when set.
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
    ;;
  *)
    echo "Unknown phase: ${phase} (expected assemble|run)" >&2
    exit 1
    ;;
esac
