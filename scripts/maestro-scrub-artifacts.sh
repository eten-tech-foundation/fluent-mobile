#!/usr/bin/env bash
# Scrub MAESTRO_* secret values from Maestro artifacts under a test output dir.
# Maestro injects env into maestro.log / commands.json — never leave passwords on disk.
set -euo pipefail

OUTPUT_DIR="${1:-}"
if [[ -z "${OUTPUT_DIR}" || ! -d "${OUTPUT_DIR}" ]]; then
  echo "usage: $0 <test-output-dir>" >&2
  exit 1
fi

# Collect non-empty secret values currently in the environment.
secrets=()
for key in \
  MAESTRO_PASSWORD MAESTRO_PASSWORD_2 \
  MAESTRO_TRANSLATOR_PASSWORD MAESTRO_PM_PASSWORD \
  MAESTRO_EMAIL MAESTRO_EMAIL_2 \
  MAESTRO_TRANSLATOR_EMAIL MAESTRO_PM_EMAIL; do
  val="${!key:-}"
  if [[ -n "${val}" ]]; then
    secrets+=("${val}")
  fi
done

if ((${#secrets[@]} == 0)); then
  exit 0
fi

# Prefer perl for literal string replace without treating metacharacters as regex.
scrub_file() {
  local file="$1"
  local secret
  for secret in "${secrets[@]}"; do
    SECRET="${secret}" perl -i -pe 'BEGIN { $s = $ENV{"SECRET"}; } s/\Q$s\E/[REDACTED]/g' "${file}" 2>/dev/null || true
  done
}

while IFS= read -r -d '' file; do
  scrub_file "${file}"
done < <(find "${OUTPUT_DIR}" \( \
  -name 'maestro.log' -o \
  -name 'commands.json' -o \
  -name '*.log' -o \
  -name 'manifest.json' -o \
  -name '*.txt' -o \
  -name '*.json' \
\) -type f -print0 2>/dev/null)
