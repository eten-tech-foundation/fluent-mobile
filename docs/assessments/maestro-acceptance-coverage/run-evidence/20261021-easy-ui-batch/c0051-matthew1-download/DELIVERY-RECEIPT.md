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
