# D-0702-01 durable wrapper — preparation / admission receipt

**Written:** 2026-10-21 · Cursor Auto · authoring gates only unless noted  
**Criterion:** `D-0702-01` · issues [#702](https://github.com/eten-tech-foundation/fluent-mobile/issues/702) + [#717](https://github.com/eten-tech-foundation/fluent-mobile/issues/717)  
**Product fix:** historical [#705](https://github.com/eten-tech-foundation/fluent-mobile/pull/705) (merged) — app source; this PR is test-only automation.

---

## Authored files

| Path | Role |
| --- | --- |
| `.maestro/flows/offline/d0702-ee-gospel-ch1-download-persist-existing-session.yaml` | Ordered wrapper |
| `.maestro/flows/offline/d0702-book-ch1-unavailable-persist.yaml` | Nested per-book ch1 probe |
| `.maestro/flows/offline/d0702-assert-hydration-available.yaml` | Available terminal suite |
| `.maestro/flows/offline/d0702-assert-hydration-unavailable.yaml` | Unavailable (couldn't-load) terminal suite |
| `.maestro/fixtures/d0702-ee-gospel-project13.manifest.json` | Named fixture metadata |
| `.maestro/flows/offline/d0702-ee-gospel-ch1-download-persist.test.cjs` | Offline static tests (10 `it` + 1 optional skip) |
| `scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.py` | Host external-finally runner |
| `scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.test.py` | Runner unit tests (FakeBridge; 21) |
| `scripts/qa717-easy-ui-batch/d0702-graal-gate.py` | Installed-Graal eval of extracted YAML `${...}` |

**Not edited:** app source, coverage ledger, held API435 / 717-tooling-cleanup, other flows, unpublished shared runners.

---

## Device vs authoring truth

| Layer | Status |
| --- | --- |
| Retained direct Android behavior (ch1 0→1→0, Download stays visible) | **PASS** (prior; reconciliation receipt) — **not repeated** |
| Fresh Maestro device run on head `753aecd8` | **`MAESTRO_OK_CLEANUP_OK`** (one run; see PR body) |
| Heads after `753aecd8` (including `984fc794` and this correction) | **NOT re-executed on device** — do not stamp a new device pass |
| Permanent YAML + fixture + static checks | **ELIGIBLE** |
| Host external finally (21 FakeBridge unit tests) | **ELIGIBLE** as authoring/dry-run |
| Graal gate (`d0702-graal-gate.py`) | **ELIGIBLE** when `~/.maestro/lib` jars exist; fails closed if missing |
| C51 / available download byte arithmetic | **not_run** |

`runtime_pass_claimed` in receipts stays **false**. The `753aecd8` device outcome is an observed functional run, not nightly QA or repeated-run reliability.

---

## Why not env-wrap `pfo-download-button-persist.yaml`

Observed project13/PM9 uses **Selected chapters** + **Chapter 1**, not Assigned + Select-all (`pfo-selector-values.js`). Shared helper not modified.

Also avoided `goto-home.yaml` (pulls untagged `ensure-no-modal` → fails ordered recursive fixture-guard when that guard is present).

---

## External finally runner

`scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.py`

- Stdlib only; **no** import of unpublished `run-b0013-*` helpers (absent from `origin/main`).
- Default / `--dry-run`: FakeBridge — **AUTHORING_ONLY**, never claims runtime PASS.
- `--execute` (root only): AdbBridge + `scripts/maestro-test.sh` (committed on main).
- `--execute` that skips Maestro → exit **2** (`SKIPPED_MAESTRO`).
- Baseline takes: **owner10=10 + owner9=1 → total 11** (stale “10 only” rejected).
- Snapshots: selected take ids/hashes (`pref_ui_version` in KV allowlist), cache probe.
- Missing/empty sha256 → **hash drift**.
- `finally`: bounded UI restore toward Home + active12 + accounts 10/9/12; re-snapshot takes/prefs.
- Cleanup failure → **`CLEANUP_UNCERTAIN`** (visible); never PASS.
- Forbidden: DB writes, clearState/clear cache, network/mic toggle, credential reads, LogBox suppression.

```bash
# Unit tests (no device)
python3 scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.test.py

# Dry-run host path (FakeBridge)
python3 scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.py --dry-run

# Graal gate (requires installed Maestro jars under ~/.maestro/lib)
python3 scripts/qa717-easy-ui-batch/d0702-graal-gate.py

# Live (ROOT ONLY — re-run only when intentionally validating a head)
python3 scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.py --execute --serial emulator-5554
```

### Root `--execute` attempt (head `161f14ae`) — preserved failure

Artifact (not committed): `host-runner/host-runner-result.json` + `host-runner/maestro-run/run.log`.

| Field | Actual |
| --- | --- |
| outcome | `MAESTRO_FAIL_CLEANUP_OK` |
| maestroExit | `2` |
| flow actions | **none** (CLI rejected before launch) |
| run.log | `option '--device' (<deviceId>) should be specified only once` |
| baselineOk / prefs / 11 takes / Home12 cache | preserved (`true` / no drift) |

**Cause:** `AdbBridge.run_maestro` passed `--device emulator-5554` into `scripts/maestro-test.sh`, which already injects `--device "$SERIAL"` from `ANDROID_SERIAL`.

**Fix (static, this branch):** runner builds wrapper argv **without** `--device`/`--udid`; serial via `ANDROID_SERIAL` only.

### Drawer false-positive (root live route 2026-10-21)

Home IDs remain visible behind an open drawer; gear taps then hit `settings-menu-more-settings`. Flow entry **and both post-switch** gear taps assert drawer/`more-settings` absent before `home-settings-button`.

---

## Offline validation commands

```bash
# Jest CI path (dual-runner — 10 contract assertions + optional skip)
npm test -- --ci --testPathPattern='d0702-ee-gospel-ch1-download-persist' --no-coverage
# Standalone node:test path
node --test .maestro/flows/offline/d0702-ee-gospel-ch1-download-persist.test.cjs
python3 scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.test.py
python3 scripts/qa717-easy-ui-batch/d0702-graal-gate.py
maestro check-syntax .maestro/flows/offline/d0702-ee-gospel-ch1-download-persist-existing-session.yaml
maestro check-syntax .maestro/flows/offline/d0702-book-ch1-unavailable-persist.yaml
# When scripts/maestro-fixture-guard.cjs exists (not on origin/main):
node scripts/maestro-fixture-guard.cjs --preflight --recursive -- \
  .maestro/flows/offline/d0702-ee-gospel-ch1-download-persist-existing-session.yaml
```

### Explicit dependency note

`scripts/maestro-fixture-guard.cjs` is **not** on `origin/main`. The optional suite uses **`it.skip`** when absent (not a fake PASS). Do **not** pull 717-tooling-cleanup / unpublished guard into this PR.

---

## Empty catalog terminal

Successful empty catalog (`No downloadable resources are available for the selected chapters.` with no resources section) is a third hydration terminal (`empty`) alongside **available** and **couldn't-load unavailable**. Nested `assertTrue` admits `available || unavailable || empty`; available/unavailable suites still run only on their branches. No invented empty-catalog fixture — detection is message + absent resources section.
