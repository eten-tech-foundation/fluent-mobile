# Live log reader (QA717)

Small incremental sanitized reader for **owned Metro logs** and **explicit-serial adb logcat dumps**. Controllers call it at Maestro checkpoints; it does **not** start Metro, tap, reload, or navigate.

## Reuse

- Redaction patterns aligned with `sanitize_remote_stderr` in qa717 runners and path/length discipline from `src/utils/sanitizeUploadError.ts` (logic copied into this script — app source untouched).
- Cursor + JSONL receipts live under the controller’s artifact directory (not agent chat).

## Durable Metro capture (do not start Metro here)

In a **new owned foreground Terminal** tab, wrap Expo so the log flushes for incremental reads. Prefer `/usr/bin/script -q -F` (flush; **no** `-k` / `-r` keystroke recording):

```bash
cd /path/to/fluent-mobile   # or task worktree
export EXPO_PUBLIC_API_BASE_URL=https://qa.api.fluent.bible
export EXPO_PUBLIC_E2E_MODE=1
# plus any task-owned hold flags already approved
/usr/bin/script -q -F /path/to/owned-metro.log \
  ./node_modules/.bin/expo start --port 8081
```

`tee -a` is acceptable if the environment already flushes line-buffered Expo output equivalently. This helper never launches Expo.

## Controller checkpoints

After each meaningful Maestro step:

```bash
python3 scripts/qa717-easy-ui-batch/live-log-reader.py metro-read \
  --log /path/to/owned-metro.log \
  --state /path/to/artifacts/metro.cursor.json \
  --run-id "$RUN_ID" \
  --action "tap_prepare_offline_download" \
  --receipts /path/to/artifacts/sanitized-receipts.jsonl
```

Stdout is a **summary only** (`newLines`, cursor offset, truncation). Receipts JSONL hold sanitized lines with `observedAtUtc`, `runId`, `source`, `maestroAction`, `sanitizedLine`.

## Logcat (read-only dump)

Confirmed via `adb logcat --help` on this host: buffers `main,system,crash`; format modifiers include `threadtime` and `UTC`.

```bash
python3 scripts/qa717-easy-ui-batch/live-log-reader.py logcat-argv --serial emulator-5556
# Then (controller-owned; redirect to restricted local raw file):
adb -s emulator-5556 logcat -d -b main,system,crash -v threadtime,UTC \
  > /path/to/restricted/raw-logcat.txt
python3 scripts/qa717-easy-ui-batch/live-log-reader.py file-read \
  --log /path/to/restricted/raw-logcat.txt \
  --state /path/to/artifacts/logcat.cursor.json \
  --run-id "$RUN_ID" \
  --action "post_cancel_observe" \
  --source logcat \
  --receipts /path/to/artifacts/sanitized-receipts.jsonl
```

If capturing useful device lines requires launching Fluent, **leave that gate unverified** — do not launch the app from this helper.

## Restricted raw storage

- Raw Metro/`script` and raw `logcat -d` files are **local controller artifacts only**.
- Do not paste raw files into chat/agent output.
- Delete or rotate raw files at handback; keep sanitized JSONL if needed for receipts.
- **State/cursor JSON is secret-free:** only `schemaVersion`, `byte_offset` (start of the next unread *complete* line), `inode`, and `size`. It never stores unfinished line fragments.
- Unfinished lines (no trailing newline yet) stay only in the restricted raw log. The next checkpoint re-reads those bytes from the raw file, then advances the cursor past completed lines only. Truncation/rotation (smaller file or inode change) resets the offset to `0`.
- Legacy v1 state that contained an `incomplete` string is loaded by rewinding `byte_offset` and is rewritten without that field.

## Redaction (fail closed)

- Authorization / Bearer / token / password / cookie values → `***`
- URL query strings (incl. signed URL params) → `?<redacted-query>` / `param=***`
- Emails → `<redacted-email>`
- Unknown JSON / `requestBody` / `responseBody` / `payload` / `headers` / `stack` → `<redacted:structured-payload>`
- Tiny allowlisted technical dicts (`code`, `itemId`, `projectId`, …) may be kept after secret redaction

## Tests

```bash
python3 scripts/qa717-easy-ui-batch/live-log-reader.test.py
```

Covers cursor/no-duplicate, truncation, receipt fields, multiline native errors, secret/URL/payload redaction (incl. malformed), secret-free state across a split secret line (CLI checkpoints), legacy incomplete rewind, and a synthetic two-read new-only CLI proof.
