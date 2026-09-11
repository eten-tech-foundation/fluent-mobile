#!/usr/bin/env bash
# Opt-in Maestro MCP bring-up: device reverse + instructions (does not force-enable MCP).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "${ROOT}/scripts/maestro-android-up.sh"

echo ""
echo "==> Opt-in agent / MCP loop"
echo "1. Keep Metro running with EXPO_PUBLIC_E2E_MODE=1 (see maestro:android:up output)."
echo "2. Wire Cursor MCP from .cursor/mcp.maestro.example.json — point command at:"
echo "     ${ROOT}/scripts/maestro-mcp.sh"
echo "3. Ask the agent to use Maestro tools (inspect_screen, run, …)."
echo ""
echo "Rules during iteration:"
echo "  - Do NOT use clearState / clearKeychain mid-loop (wipes session)."
echo "  - clearState belongs only in cold-start helpers (.maestro/helpers/launch-android.yaml)."
echo "  - Maestro is NOT a /create-pr or CI merge gate."
echo ""
echo "Smoke without MCP: npm run maestro:test:harness"
echo "MCP stdio server:  ${ROOT}/scripts/maestro-mcp.sh"
