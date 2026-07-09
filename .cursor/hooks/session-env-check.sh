#!/usr/bin/env bash
# Cursor sessionStart — warn-only env blockers for fluent-mobile.
# Never denies tools; never exits non-zero for missing optional state.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 0

WARNINGS=()

# Node engines: package.json says >= 24.14.0
if command -v node >/dev/null 2>&1; then
  NODE_V="$(node -v 2>/dev/null | sed 's/^v//')"
  MAJOR="$(printf '%s' "$NODE_V" | cut -d. -f1)"
  MINOR="$(printf '%s' "$NODE_V" | cut -d. -f2)"
  PATCH="$(printf '%s' "$NODE_V" | cut -d. -f3)"
  if [ -z "$MAJOR" ] || [ "$MAJOR" -lt 24 ] || { [ "$MAJOR" -eq 24 ] && [ "${MINOR:-0}" -lt 14 ]; }; then
    WARNINGS+=("Node $NODE_V is below engines (>= 24.14.0). Use nvm use 24 (or install Node 24.14+).")
  fi
else
  WARNINGS+=("node not found on PATH. Install Node >= 24.14.0.")
fi

if [ ! -f .env ]; then
  WARNINGS+=("Missing .env — run: cp .env.example .env and set EXPO_PUBLIC_API_BASE_URL.")
elif ! grep -qE '^[[:space:]]*EXPO_PUBLIC_API_BASE_URL[[:space:]]*=[[:space:]]*[^[:space:]]+' .env 2>/dev/null; then
  WARNINGS+=("EXPO_PUBLIC_API_BASE_URL is empty or missing in .env (see .env.example).")
fi

if [ ${#WARNINGS[@]} -eq 0 ]; then
  exit 0
fi

MSG="$(printf '%s\n' "${WARNINGS[@]}")"
if command -v python3 >/dev/null 2>&1; then
  ESCAPED="$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
  printf '{"additional_context":%s}\n' "$ESCAPED"
else
  # Fallback: single-line JSON without python
  ESCAPED="$(printf '%s' "$MSG" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')"
  printf '{"additional_context":"%s"}\n' "$ESCAPED"
fi

exit 0
