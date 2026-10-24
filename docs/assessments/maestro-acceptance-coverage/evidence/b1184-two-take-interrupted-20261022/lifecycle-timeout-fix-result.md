# B1184 lifecycle TimeoutExpired fix (test-only — no device)

**Context:** fe990 / `worktrees/b0016-b0017-two-take`. Actual receipt: `task10/artifacts/b1184-two-take-20261022/RESULT.md`. Zero-byte B tempfile preserved untouched. A untouched. Attempt1 consumed (durable started=1); **one attempt remains** — this job did **not** run or claim a second take.

## Defect (actual)

Adapter READY → root Start → poll UIA dump raised **uncaught** `subprocess.TimeoutExpired` (3s) **before** `arm_after_start` → no `armed-attempt-1.json` → independent Stop timer path silently lost.

## Tests before → after

| Suite | Before fix | After fix |
| --- | --- | --- |
| `b1184_lifecycle_timeout.test.py` | **Ran 3 — FAILED (errors=3)** uncaught `TimeoutExpired` | **Ran 3 — OK** |
| `b1184_stop_guard_adapter.test.py` | (not re-run as before) | Ran 10 — OK |
| `capture_bounded_stop_guard.test.py` | — | Ran 9 — OK |

Before evidence: `/tmp/b1184-lifecycle-before.txt` (`errors=3`).  
After evidence: `/tmp/b1184-lifecycle-after.txt` (`OK`).

## Changed files (only)

- `scripts/qa717-easy-ui-batch/b1184_stop_guard_adapter.py` — arm-before-READY; `safe_dump` fail-closed; poll timeout retains armed timer + uncertainty receipt; readiness expiry bound
- `scripts/qa717-easy-ui-batch/b1184_lifecycle_timeout.test.py` — **new** focused regressions
- `scripts/qa717-easy-ui-batch/b1184_stop_guard_adapter.test.py` — expect `stopDeadlineArmedBeforeReady`

A1186 helper **not modified**. Runtime artifacts under `artifacts/b1184-two-take-20261022/` **not modified**.

## Corrected minimal execution sequence (future root — NOT run here)

1. Start adapter `--live-adb --watch-one` (receipt dir).
2. Wait for **both**:
   - `armed-attempt-N.json` with `stopDeadlineArmedBeforeReady=true`
   - `ready-for-root-start.json` with `status=READY_FOR_ROOT_START` and valid `readinessExpiresOffsetS` (15s from arm)
3. **Immediately before** manual Start: recheck both receipts still valid (not expired / not `UNCERTAIN_*` / not missing armed).
4. Tap `record-start-button` only if still valid. Guard never Start.
5. If `uncertain-uia-timeout-armed-retained.json`: Stop timer still running — **no second Start** until `--reconcile` after attempt settles.
6. Best-effort under-30s target via 15s host deadline; **no absolute hardcap guarantee** (frozen app/adb delay accepted).

## Non-claims / holds

- No device/adb/Start/capture in this job.
- No emergency force-stop.
- A1186 failed-pericope replay hold still default deny.
- B pins unchanged; max 2 incl. partials; durable counter not reset.
- Do not treat attempt1 as unconsumed.
