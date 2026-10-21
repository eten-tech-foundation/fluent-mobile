# C-0051 admission packet — delivery receipt (bounded packaging review)

**Date:** 2026-10-21  
**Worktree:** `worktrees/pfo51-small-download-test`  
**Branch:** `mrace/test/51-pfo-matthew1-small-download` @ base `753aecd8` (PR755)  
**Scope:** admission hardening + packaging docs status; no device/ADB/Maestro execute in this correction; primary ticket **#758** (related #51 / #717 / #756).

## Verdict: READY (packaging docs) / BLOCK (device execute)

- **READY packaging docs publication** — focused gates ran under ordinary approved Shell (prior hold resolved). Do **not** treat as device authorization.
- **BLOCK** any device/`--execute` path (original fixture NONADMISSIBLE; queue205 refuse-rerun; no predownload oracle).
- Measured: guard **23**/23 (session `756c54fb`, earlier; not repeated); Node C-0051 **13**/13; Python host **27**/27; `--dry-run` exit **2** `STATIC_GUARD_BLOCKED` before ADB (`runtime_pass_claimed: false`).
- Optional external receipt Write (`task-10/.../remaining-gates-measured.md`) `Rejected:` — **held**; no retry/copy/recreate. Existing CLI result JSON retains measured results.
- Prior review-session Shell `Rejected:` / MCP `get_file_contents` denials are superseded for gate execution only; they do not authorize device run.

## host-runner-result.json labeling (unchanged this edit)

| Field | Status |
|-------|--------|
| `evidenceKind` | remains `derived_static_expectation_not_executed` (historical unexecuted expectation) |
| `staticGuard` / `outcome` / `visible` | remain `null` in that file — **not** edited to match measured dry-run |
| `expectedStaticGuard` / `expected_outcome` | predicted-only snapshot retained |
| Measured dry-run | observed elsewhere (CLI JSON); file left as expectation historical |
| `historicalCapFailure` | retained as prior audited transfer facts |
| `readonly-smoke-result.json` | **untouched** |
| task10/artifacts historical runtime | **untouched** |
| external `remaining-gates-measured.md` | Write held (`Rejected:`); not recreated |

## Provenance correction

| Item | Value |
|------|-------|
| Guard baseline (verified) | `d2da6fece7e5b7e0bc0dd8cb19836ec992db36b1` (`d2da6fece`, **504** lines) |
| Prior typo (fixed) | `d2da6fec7e…` (missing `e`) |
| Live guard | `scripts/maestro-fixture-guard.cjs` ≈**998** lines ≈504 + ~494 pfo-only delta |
| PROVENANCE | `scripts/maestro-fixture-guard.PROVENANCE.md` |

## Cap-failure facts (no further runs)

| Observation | Value |
|-------------|-------|
| UI aggregate | 2.4 MB Total/CTA + Reference Images **0 B** (unknown) |
| After transfer | **205** queue items, **26,957,219** bytes; images **24,491,361** |
| Preserve | 11 recordings + 19 prior cache paths; new project13 files retained |
| Rerun | Refused (`fresh_fixture_refused` when terminal queue ≥205 / non-empty) |

## Focused gates (measured — ordinary approved Shell)

| Suite | Count | Observed | Command |
|-------|------:|----------|---------|
| Node pfo-download guard | **23** | PASS (session `756c54fb`) | `node --test scripts/maestro-fixture-guard.pfo-download.test.cjs` |
| Node C-0051 flow static | **13** | PASS (exit 0) | `node --test .maestro/flows/offline/c0051-matthew1-small-download.test.cjs` |
| **Node total** | **36** | | |
| Python host unit | **27** | PASS (exit 0) | `python3 scripts/qa717-easy-ui-batch/run-c0051-a5554-external-finally.test.py` |
| Dry-run original | exit **2** | `STATIC_GUARD_BLOCKED` before ADB (safe refuse; not runtime PASS) | `python3 …/run-c0051-a5554-external-finally.py --dry-run` |
| Maestro syntax | offline check-syntax only | not re-asserted here | flow YAML |
| `format:check` | **N/A** | | Prettier scoped to `src/**/*.{ts,tsx}` only |

### Default-deny design (unit inventory — not re-executed here)

- Mutating + `pfo-download` without admission env → BLOCKED  
- Mutating without `pfo-download` tag → chapter-pin / default deny  
- Original manifest `incomplete-unknown-images` / Images `0 B` → NONADMISSIBLE  
- Known-complete structural static PASS; execute/runtime → `predownload_oracle_unavailable_fail_closed`  
- Queue 205 → `fresh_fixture_refused:terminal_queue_present`

## Dependencies (755 base)

| Dependency | Status |
|------------|--------|
| `scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.py` | Present on 755 stack — **required** |
| Guard baseline `d2da6fece` | **Absent** from 755 — stage as prereq or vendor with PROVENANCE |
| Held 717 / full `maestro-test.sh` / hooks | **Out of scope** |

## Staging plan (root Git; this agent does not commit)

1. Focused gates already measured (above); leave `host-runner-result.json` as derived historical expectation.  
2. **Commit A — baseline prereq:** guard at verified `d2da6fece7e5b7e0bc0dd8cb19836ec992db36b1` (504 lines).  
3. **Commit B — focused packet:** pfo delta + C-0051 packet (docs status accurate).  
4. Publish **#758** stacked on PR755 base (`753aecd8`). Never stage `__pycache__/`.

## Explicit non-claims

- Not a general 5 MB safety / universal cap guarantee.  
- Known-complete fixture ≠ execute authorization.  
- Original cap failure retained (2.4 MB + Images 0 B → 205 / ~27 MB).  
- C-0051-06 / C-0052-02 not closed by this packet.  
- Derived `host-runner-result.json` expectation fields remain **not** measured output.

## CI correction (PR759 Unit Tests — dual-runner registration)

- **CI fail (run 39619211495 / job 119287811317):** `scripts/maestro-fixture-guard.pfo-download.test.cjs` — Jest: "Your test suite must contain at least one test." Suites: 1 failed, 1 skipped, 250 passed; tests: 2145 passed. Cause: file imported `describe`/`it` from `node:test` only; Jest discovered the file but registered zero tests. `node --test` still sees all **23**.
- **Fix (worktree, uncommitted by this agent):** same dual-runner harness as `.maestro/flows/offline/c0051-matthew1-small-download.test.cjs` / `d0702-ee-gospel-ch1-download-persist.test.cjs` — under Jest use `global.describe`/`global.it`; else `require('node:test')`. Assertions and default-deny unchanged; no Jest config exclude; no app behavior change.
- **Local verify (prior attempt):** Shell tool returned verbatim `Rejected:` on pre-fix focused Jest — stopped; no retry. Prior full-suite attempt: guard path OK but **3** layer-boundary failures from missing local ESLint path (worktree had no `node_modules`).

## Final local verification (this continuation — measured)

### Dependency provenance (local only; do not commit)

| Item | Value |
|------|-------|
| Worktree `node_modules` before | **absent** |
| Action | `ln -s` only (reversible); never replaced existing path |
| Symlink target | `/Users/matt/Documents/Development/gloo/fluent-mobile/node_modules` |
| Confirmed binary | `/Users/matt/Documents/Development/gloo/fluent-mobile/node_modules/eslint/bin/eslint.js` (exists, executable) |
| Install/npx/network | **not used** |
| Publication | **none** (root handles commit/push) |

### Measured gates (exact)

| Suite | Count / result | Exit | Command |
|-------|----------------|-----:|---------|
| Node pfo-download guard | **23** pass / **0** fail (suites **2**) | **0** | `node --test scripts/maestro-fixture-guard.pfo-download.test.cjs` |
| Full Jest CI | Suites: **1** skipped, **251** passed, **251** of **252** total; Tests: **1** skipped, **2168** passed, **2169** total; Snapshots: **1** passed | **0** | `npm test -- --ci --maxWorkers=4` |
| Jest discovery of dual-runner file | `PASS scripts/maestro-fixture-guard.pfo-download.test.cjs` (included in suite totals above) | (same) | (same full suite) |
| `architecture-guard` | `architecture-guard: ok` | **0** | `npm run architecture-guard` |
| `lint` | **0** errors, **13** warnings (pre-existing; unrelated files) | **0** | `npm run lint` |
| `format:check` | All matched files use Prettier code style | **0** | `npm run format:check` |

### Unchanged claims

- All **23** guard assertions / default-deny inventory unchanged.
- Historical CI fail (zero Jest tests) and prior Rejected focused-Jest attempt retained above.
- Cap-failure facts / `host-runner-result.json` historical expectation / external held receipt: **untouched**.
- No device/network/download/install; no source edits beyond dual-runner harness + this receipt append.
- Root: stage `scripts/maestro-fixture-guard.pfo-download.test.cjs` + this receipt only; **never** stage worktree `node_modules` symlink or `__pycache__/`.
