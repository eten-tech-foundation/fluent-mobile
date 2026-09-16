#!/usr/bin/env bash
# Offline login smoke: toggle airplane mode around the Maestro offline flow.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

restore_network() {
  bash "${ROOT}/scripts/maestro-adb-network.sh" online || true
}
trap restore_network EXIT

bash "${ROOT}/scripts/maestro-adb-network.sh" offline
# Do not exec — EXIT trap must restore network after the child finishes.
bash "${ROOT}/scripts/maestro-test.sh" \
  --config .maestro/config.yaml \
  .maestro/flows/offline/login-offline.yaml \
  "$@"
