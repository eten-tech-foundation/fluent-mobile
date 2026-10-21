# C-0051-06 — Matthew1 small download (admission packet)

**Worktree:** `worktrees/pfo51-small-download-test`  
**Branch:** `mrace/test/51-pfo-matthew1-small-download` @ `753aecd8` (PR755 head)  
**Stack later on:** `mrace/test/702-gospel-download-persist`  
**Refs:** primary focused **#758**; related #51, #717, #756 (size-unknown product); primary packaging: testing/admission

## Status: docs publication-ready (gates measured) — device execute still BLOCK / NONADMISSIBLE

Original selected catalog showed Total/CTA **2.4 MB** with Reference Images **Image 0 B** (unknown). That transfer completed **205** queue rows / **26,957,219** bytes (images **24,491,361**). Fixture project13 content is retained; **do not re-run** Download from the stale aggregate.

- **Packaging docs publication READY** after ordinary approved Shell gates (prior hold resolved). Observed: guard **23**/23 in idle session `756c54fb` (not re-run); Node C-0051 flow **13**/13; Python host unit **27**/27; `--dry-run` exit **2** with `STATIC_GUARD_BLOCKED` before ADB (safe expected refuse; not runtime PASS).
- Optional Write of external `task-10/.../remaining-gates-measured.md` was `Rejected:` — **held**; do not retry/copy/recreate. CLI result JSON already retains measured results.
- `host-runner-result.json` remains `derived_static_expectation_not_executed` — historical unexecuted expectation snapshot; **not** overwritten with measured dry-run.
- Device/`--execute` still **BLOCKED** (original fixture NONADMISSIBLE; queue205 refuse-rerun; no predownload oracle).
- Known-complete bounded manifest is **structural unit only** (execute stays fail-closed). **Does not** prove general 5 MB safety.
- Preserve historically: 11 recordings + 19 prior cache paths; new project13 files retained. No further device runs from this packet.
- `readonly-smoke-result.json` remains **historical** (untouched). Prior task10/artifacts runtime evidence remains untouched.
- Guard baseline verified: `d2da6fece7e5b7e0bc0dd8cb19836ec992db36b1`. Root stages **2** commits and publishes **#758** stack on PR755 base after these docs are accurate.

SQL never selects `resume_data` / tokens. URLs stripped of query/fragment.

### Queue settle policy (`DownloadQueueStatus`) — host unit coverage only

| State | Host action |
|-------|-------------|
| `queued` / `downloading` | Poll until clear (deadline 180s) |
| `paused` | `CLEANUP_UNCERTAIN` — no auto-Resume; no account switch |
| `failed` / `cancelled` | `TRANSFER_FAILED` — UI restore OK; never claim complete |
| all `completed` (≥1 project13) | Success path after preserve checks |
| deadline exhausted | `CLEANUP_UNCERTAIN` + exact statuses; no blind cancel/kill |

## Packaging dependency (required)

Guard baseline **`d2da6fece7e5b7e0bc0dd8cb19836ec992db36b1`** (`d2da6fece`, 504 lines) `scripts/maestro-fixture-guard.cjs` is **absent** from 755. See `scripts/maestro-fixture-guard.PROVENANCE.md`.

- Prefer: land that 504-line prerequisite commit, then apply **only** the pfo-download admission delta + C-0051 packet.
- Alternate: ship vendored baseline+delta with provenance (not a silent 717 tooling sweep / not `maestro-test.sh` ordered-journey bundle).

Host helper dependency on 755 base: `scripts/qa717-easy-ui-batch/run-d0702-a5554-external-finally.py` (AdbBridge / FakeBridge / takes / prefs / `bounded_ui_restore`) — must remain tracked; do not vendor from held worktrees.

## Host command — dry-run / refuse only (no device execute)

```bash
cd worktrees/pfo51-small-download-test   # or packaged checkout
export MAESTRO_PFO_DOWNLOAD_ADMISSION=c0051-matthew1-small
export MAESTRO_PFO_DOWNLOAD_MANIFEST=.maestro/fixtures/c0051-matthew1-small-download.manifest.json
export MAESTRO_FIXTURE_PROJECT_ID=13
export MAESTRO_FIXTURE_PROJECT_ALLOWLIST=13

# Expect STATIC_GUARD_BLOCKED (original fixture NONADMISSIBLE). Do not --execute.
python3 scripts/qa717-easy-ui-batch/run-c0051-a5554-external-finally.py --dry-run
```

## Focused gates (no device)

```bash
node --test scripts/maestro-fixture-guard.pfo-download.test.cjs
node --test .maestro/flows/offline/c0051-matthew1-small-download.test.cjs
python3 scripts/qa717-easy-ui-batch/run-c0051-a5554-external-finally.test.py
python3 scripts/qa717-easy-ui-batch/run-c0051-a5554-external-finally.py --dry-run
maestro check-syntax .maestro/flows/offline/c0051-matthew1-small-download-existing-session.yaml
```

## Does not close on packaging

- **C-0051-06** / **C-0052-02** remain open until a future **admissible** fixture + root-owned execute (new oracle / product size completeness). This packet hardens admission and records the cap failure; it does **not** authorize Download.
