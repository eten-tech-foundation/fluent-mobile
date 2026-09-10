#!/usr/bin/env bash
# Install the Maestro CLI (Android E2E). Requires Java 17+.
set -euo pipefail

echo "==> Checking Java (need 17+)..."
if ! command -v java >/dev/null 2>&1; then
  echo "error: java not found. Install a JDK 17+ and set JAVA_HOME." >&2
  exit 1
fi
java -version 2>&1 | head -3

MAESTRO_BIN="${HOME}/.maestro/bin"
export PATH="${MAESTRO_BIN}:${PATH}"

if command -v maestro >/dev/null 2>&1; then
  echo "==> Maestro already on PATH: $(command -v maestro)"
  maestro --version 2>/dev/null || maestro --help | head -5
  echo "OK: maestro:install (already installed)"
  exit 0
fi

echo "==> Installing Maestro CLI via get.maestro.mobile.dev..."
curl -fsSL "https://get.maestro.mobile.dev" | bash

export PATH="${MAESTRO_BIN}:${PATH}"
if ! command -v maestro >/dev/null 2>&1; then
  echo "error: install finished but 'maestro' is not on PATH." >&2
  echo "Add ${MAESTRO_BIN} to your shell PATH, then re-run." >&2
  exit 1
fi

maestro --version 2>/dev/null || maestro --help | head -5
echo "OK: maestro:install"
echo "Tip: add export PATH=\"\$HOME/.maestro/bin:\$PATH\" to your shell profile."
