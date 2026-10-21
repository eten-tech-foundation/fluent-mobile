# D-0702-01 durable wrapper — preparation / admission receipt

**Written:** 2026-10-21 · Cursor Auto · **no device / no ADB / no Maestro execution in authoring**  
**Criterion:** `D-0702-01` · issues [#702](https://github.com/eten-tech-foundation/fluent-mobile/issues/702) + [#717](https://github.com/eten-tech-foundation/fluent-mobile/issues/717)  
**Prior retained Android behavior:** PASS (PM9 / A5554 / project13) — not re-run here.  
**Product fix:** historical [#705](https://github.com/eten-tech-foundation/fluent-mobile/pull/705) (merged) — app source; this PR is test-only automation.

---

## Authored files

| Path | Role |
| --- | --- |
| `.maestro/flows/offline/d0702-ee-gospel-ch1-download-persist-existing-session.yaml` | Ordered wrapper |
| `.maestro/flows/offline/d0702-book-ch1-unavailable-persist.yaml` | Nested per-book ch1 probe |
| `.maestro/fixtures/d0702-ee-gospel-project13.manifest.json` | Named fixture metadata |
| `.maestro/flows/offline/d0702-ee-gospel-ch1-download-persist.test.cjs` | Offline static tests (self-contained) |
| `scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.py` | Host external-finally runner |
| `scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.test.py` | Runner unit tests (FakeBridge) |

**Not edited:** app source, coverage ledger, held API435 / 717-tooling-cleanup, other flows, unpublished shared runners.

---

## Prior behavior PASS vs this package

| Layer | Status |
| --- | --- |
| Retained direct Android behavior (ch1 0→1→0, unavailable hint, Download disabled) | **PASS** (prior; Codex receipt) — **not repeated** |
| Permanent YAML + fixture + static checks | **ELIGIBLE** (this package) |
| Host external finally (unit-tested FakeBridge) | **ELIGIBLE** as authoring/dry-run; **live --execute** is root-owned remaining work |
| Fresh Maestro device run | **NOT_RUN** |
| C51 / available download byte arithmetic | **not_run** |

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
- Baseline takes: **owner10=10 + owner9=1 → total 11** (stale “10 only” rejected).
- Snapshots: selected take ids/hashes, KV prefs allowlist, cache probe.
- `finally`: bounded UI restore toward Home + active12 + accounts 10/9/12; re-snapshot takes/prefs.
- Cleanup failure → **`CLEANUP_UNCERTAIN`** (visible); never PASS.
- Forbidden: DB writes, clearState/clear cache, network/mic toggle, credential reads, LogBox suppression.

```bash
# Unit tests (no device)
python3 scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.test.py

# Dry-run host path (FakeBridge)
python3 scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.py --dry-run

# Live (ROOT ONLY — not run in authoring)
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

**Fix (static, this branch):** runner builds wrapper argv **without** `--device`/`--udid`; serial via `ANDROID_SERIAL` only. Argv-level unit tests simulate wrapper injection and require exactly one `--device emulator-5554`.

### Drawer false-positive (root live route 2026-10-21)

Preserved Codex dumps: `d0702-live-start-drawer-*` (drawer open + Home behind) → Android Back → closed Home → gear opens drawer. Prior finally treated Home+active12 **menus** as success while drawer stayed open; next gear tap hit `settings-menu-more-settings`.

**Fix:** Home readiness = closed Home (`settings-drawer-content` absent). Preflight/finally dismiss drawer via Android Back; finally re-checks active12/cache then **must** leave drawer closed. Flow entry asserts drawer closed before gear tap.

### Remaining root run (live admission)

1. Confirm A5554 trusted session, cache 10/9/12, project13 hydrated, 11 takes intact; start from **closed** Home.  
2. Re-invoke `--execute` on the fixed runner (do not overwrite preserved `host-runner*` failure artifacts — use a new stamp dir).  
3. Accept only `MAESTRO_OK_CLEANUP_OK` with `runtime_pass_claimed: false` — product behavior already retained-PASS.  
4. Any `CLEANUP_UNCERTAIN` / `PREFLIGHT_FAIL` → stop; do not claim PASS.

---

## Offline validation commands

```bash
# Jest CI path (dual-runner — same 7 contract assertions)
npm test -- --ci --testPathPattern='d0702-ee-gospel-ch1-download-persist' --no-coverage
# Standalone node:test path
node --test .maestro/flows/offline/d0702-ee-gospel-ch1-download-persist.test.cjs
python3 scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.test.py
maestro check-syntax .maestro/flows/offline/d0702-ee-gospel-ch1-download-persist-existing-session.yaml
maestro check-syntax .maestro/flows/offline/d0702-book-ch1-unavailable-persist.yaml
# When scripts/maestro-fixture-guard.cjs exists (not on origin/main):
node scripts/maestro-fixture-guard.cjs --preflight --recursive -- \
  .maestro/flows/offline/d0702-ee-gospel-ch1-download-persist-existing-session.yaml
```

### Explicit dependency note

`scripts/maestro-fixture-guard.cjs` is **not** on `origin/main`. The optional suite uses **`it.skip`** when absent (not a fake PASS). Recursive LIVE admission still requires the guard on an authoring checkout / future tooling land — not weakened here. Do **not** pull 717-tooling-cleanup / unpublished guard into this PR.

---

## Fixture-guard capabilities vs residual runtime

| Check | Covers | Does not cover |
| --- | --- | --- |
| Nested path walk / optional recursive guard | YAML deps, tags, forbidden commands | UI truth, catalog availability |
| `maestro check-syntax` | Command schema | Device behavior |
| Runner unit tests | finally-on-failure, CLEANUP_UNCERTAIN, 11-take baseline | Live ADB |

**Residual:** root `--execute`; loading→unavailable settlement on device; C51 arithmetic remains out of scope.
