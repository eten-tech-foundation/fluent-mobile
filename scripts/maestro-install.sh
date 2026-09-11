#!/usr/bin/env bash
# Install a pinned Maestro CLI release (checksum-verified). Requires Java 17+.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=maestro-common.sh
source "${ROOT}/scripts/maestro-common.sh"

# Pin: bump deliberately when upgrading the local harness CLI.
MAESTRO_VERSION="${MAESTRO_VERSION:-2.10.0}"
RELEASE_TAG="cli-${MAESTRO_VERSION}"
RELEASE_BASE="https://github.com/mobile-dev-inc/Maestro/releases/download/${RELEASE_TAG}"

echo "==> Checking Java (need 17+)..."
maestro_require_java_17

MAESTRO_HOME="${HOME}/.maestro"
MAESTRO_BIN="${MAESTRO_HOME}/bin"
export PATH="${MAESTRO_BIN}:${PATH}"

if command -v maestro >/dev/null 2>&1; then
  echo "==> Maestro already on PATH: $(command -v maestro)"
  maestro --version 2>/dev/null || maestro --help | head -5
  echo "OK: maestro:install (already installed)"
  exit 0
fi

echo "==> Installing Maestro CLI ${MAESTRO_VERSION} (checksum-verified zip)..."
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/maestro-install.XXXXXX")"
cleanup() { rm -rf "${STAGE}"; }
trap cleanup EXIT

ARCHIVE="${STAGE}/maestro.zip"
CHECKSUMS="${STAGE}/checksums_sha256.txt"

curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
  --output "${ARCHIVE}" "${RELEASE_BASE}/maestro.zip"
curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
  --output "${CHECKSUMS}" "${RELEASE_BASE}/checksums_sha256.txt"

EXPECTED="$(awk '$2 == "maestro.zip" { print $1; exit }' "${CHECKSUMS}")"
if ! [[ "${EXPECTED}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "error: no valid SHA-256 for maestro.zip in checksums_sha256.txt" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "${ARCHIVE}" | awk '{ print $1 }')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "${ARCHIVE}" | awk '{ print $1 }')"
else
  echo "error: need sha256sum or shasum to verify the Maestro archive." >&2
  exit 1
fi

if [[ "${ACTUAL}" != "${EXPECTED}" ]]; then
  echo "error: Maestro ${MAESTRO_VERSION} checksum mismatch." >&2
  echo "  expected: ${EXPECTED}" >&2
  echo "  actual:   ${ACTUAL}" >&2
  exit 1
fi
echo "  OK  checksum ${EXPECTED}"

unzip -q "${ARCHIVE}" -d "${STAGE}"
if [[ ! -x "${STAGE}/maestro/bin/maestro" ]]; then
  echo "error: archive missing executable maestro/bin/maestro" >&2
  exit 1
fi

mkdir -p "${MAESTRO_HOME}"
# Replace install tree with verified contents (bin + libs).
rm -rf "${MAESTRO_HOME}.new"
mv "${STAGE}/maestro" "${MAESTRO_HOME}.new"
rm -rf "${MAESTRO_HOME}"
mv "${MAESTRO_HOME}.new" "${MAESTRO_HOME}"

export PATH="${MAESTRO_BIN}:${PATH}"
if ! command -v maestro >/dev/null 2>&1; then
  echo "error: install finished but 'maestro' is not on PATH." >&2
  echo "Add ${MAESTRO_BIN} to your shell PATH, then re-run." >&2
  exit 1
fi

maestro --version 2>/dev/null || maestro --help | head -5
echo "OK: maestro:install (${MAESTRO_VERSION})"
echo "Tip: add export PATH=\"\$HOME/.maestro/bin:\$PATH\" to your shell profile."
