# Independent audit quality review (preliminary)

**When:** 2026-10-20T01:23:29Z (snapshot)  
**Live:** `/Users/matt/Documents/Development/gloo/fluent-mobile`  
**Branch:** `mrace/chore/717-build-out-full-maestro-e2e-coverage`  
**HEAD:** `77ef2be3de23e5ab0f03876c1450a7fd08a5ba80` (`[#717]: Checkpoint existing-session Sync and PFO Maestro paths`) — past `c81bd86` via Timing checkpoint.  
**Identity:** `mattrace-gloo` / `mrace@gloo.us`  
**Contract UI:** `cursor/3331c934` conversation verified (SearchConversations).  
**Audit owner:** `bc-da4aa327` → `docs/assessments/issue-history-reconciliation/**` (do **not** edit; did not duplicate full 308 review).  
**Method:** Read-only structure + targeted spot-checks. No credentials/device/services/tests/git writes/public actions. No 33-doc hygiene redo.

**Not:** complete audit signoff. **Is:** preliminary independent validation while audit finishes.

---

## Snapshot counts (do not treat as frozen forever)

| Metric | Value @ snapshot |
| --- | --- |
| Ledger rows (`coverage.csv` / cohorts / index) | **308** unique IDs; cohort partitions **non-overlapping** (sum 308, dups **0**) |
| `disposition_review=yes` | **308** |
| `reconciliation_complete=yes` | **272** (user’s earlier “200/308” is **stale** — audit advanced) |
| Awaiting depth | **36** (`pending_reconciliation_depth`, mostly high-600s sample) |
| `body_retrieved` / `comments_retrieved` / `retrieval_complete` | **308 / 308 / 308** |
| `completion-counts.json` `updated_utc` | `2026-10-20T01:23:23Z` |
| Contract | `inventory/complete-row-contract.md` (complete ≠ conformance explicit) |

---

## Structural verdict

**PASS (structure)** — ID sets/dedup/retrieval flags look sound; complete-row contract exists and distinguishes acceptance vs product conformance; high-impact spot rows generally follow the four-field evidence shape.

**HOLD (quality / inventory gaps)** — SuperAdmin absent from audit all-role narrative; some lineage/staleness in secondary files; #49 remux/scrub later tickets under-cited; early-findings #721 text can lag Stage D.

---

## Accepted ≠ conformance (enforced in contract)

`complete-row-contract.md` L53–55: a complete row may record **named unwaived divergence** / **product decision required** — finished reconciliation, **not** QA pass or AC conformance. Spot-checked rows (#41, #49, #257, #599, #717, #721) correctly carry `complete≠QA_pass` / open-ticket / unisolated-cause language rather than closed-state-as-proof.

---

## Spot-check matrix (highest impact)

| Issue | Audit claim (coverage.csv) | Independent check | Verdict |
| --- | --- | --- | --- |
| **#4** filters | Server `GET /self/projects` grant/membership at API pin `4336602`; client branch absence ≠ unfiltered; unknown chapter-slot vs project-grant wording | Mobile `api.ts` `getUserProjects` → `/self/projects`; sync writes `user_projects`; README early table matches pin | **PASS** (unknown wording correctly retained) |
| **#41** logout DB / 401 | Secure-store via later #89; sign-out DB wipe **UNWAIVED_DIVERGENCE**; 401 soft reauth vs clear-login sliced | `accountSession.signOutCurrentDeviceAccount` clears creds/session pattern; stageAdvance/auth paths not full DB wipe on sign-out | **PASS** as named divergence (not oversold as fixed) |
| **#49** deferrals vs **#176/#233/#252** | Layout partial deferred via **#229** + prior waivers (**#176/#177**); permission mic CONFIRMED; warm-tab ≠ recorder AC | Corpus `issues/49.json` mentions #176/#177/#158; **#233/#252 absent** from corpus count & coverage notes (only #176/#229 called out) | **HOLD** — chronology understates later remux/scrub delivery (#233/#252 closed); does **not** invent waive, but lineage incomplete |
| **#257** | Known **unimplemented** queue; not new regression from open state | `stageAdvance.ts` logs “deferred to #257”; issue **open** | **PASS** |
| **#271 / #611 / #667** | Open remainder after #611 / PR **#667** claim-before-upload; historical Dev pre-fix | #271 open; #611/#667 closed; `chapterClaimSync.ts` + `hasClaimConflict` present | **PASS** (remainder correctly open) |
| **#599** | Open crash AC; source mitigations ≠ closed; Dev historical only | Issue open; module/orchestrator cite #599; no Nightly reverify claimed | **PASS** |
| **#607** | Fixture seed gap; API #368/#369; blocks claim Maestro | Issue open; 0 comments; body deferral from #574 | **PASS** |
| **#721** | Stages A–D; Stage D Maestro PASS ~61s; **not** wrong-coords; cause **unisolated**; not confirmed product fix | Matches `/tmp` receipts + `maestro-sync721` docs; `sync721-maestro-correction-receipt.md` present | **PASS** on Stage D framing |
| **#717** | AC unchecked; partial warm/fixture; `open-any-chapter` remains; body “open-my-work unused” **STALE**; complete≠device PASS | `open-my-work-chapter` used (~6); `open-any-chapter` still in ~4 flows | **PASS** |

---

## r10–r12 newest accepted (3 each, last of batch)

Contract shape spot-check (`recommend_complete` + four fields):

| Wave | Newest IDs | Notes |
| --- | --- | --- |
| **r10** | **#298, #300, #314** | #298 → `PlaybackProgressBar` fittedBarCount/#298 comments + PR #363 — **code path corroborated**. #300 Refs policy + PR #301. #314 expo align + PR #315. Structure **PASS**. |
| **r11** | **#377, #378, #379** | Process/board hygiene; `NO_PRODUCT_FIX` where manual; package.json format globs. Structure **PASS**. |
| **r12** | **#448, #451, #452** | #448 hint logic + open In QA / product hold — complete≠QA OK. #451/#452 Observer/comments **unimplemented** correctly with `reason_not_applicable`. Structure **PASS**. |

---

## Concrete holds / line issues

1. **SuperAdmin / SA missing from audit all-role inventory**  
   - `docs/assessments/issue-history-reconciliation/README.md`: **no** `SuperAdmin` string; role table discusses Org Manager / Translator wording for #4 only.  
   - Inventory grep for SuperAdmin/all-role inventory: **empty**.  
   - Living `docs/guides/maestro-role-coverage.md` still lists SuperAdmin as **web-only unverified**.  
   - **Required:** record SA explicitly as **unknown / unverified** (no session) — **not omit** because template silent.  
   - **HOLD** until integrator adds explicit SA row/note to audit inventory/README.

2. **#49 lineage gap (#233 / #252)**  
   - Coverage notes cite #176/#177/#229 but not closed **#233** (native remux) / **#252** (scrub wire) that later delivered deferred seek/scrub slices.  
   - Risk: stale chronology / “deferred forever” impression without claiming false waive.  
   - **HOLD** for lineage deepen on #49 (not necessarily reopen disposition).

3. **Stale secondary chronology vs Stage D**  
   - `integrator-early-findings.json` still summarizes #721 with “ONE Maestro … **FAIL** sync-screen” while `coverage.csv` #721 Stage_D documents Maestro **PASS** ~61s.  
   - Early findings `updated_utc` `01:04:41Z` predates Stage D receipt integration.  
   - **HOLD:** treat early-findings as **superseded** by coverage Stage_D for Sync; do not cite early FAIL as current.

4. **`cohort-status.json` freshness**  
   - Still shows **c2/c5** `running_original_no_output_yet` at `01:04:41Z` while completion is **272/308** via wave reviewers.  
   - Not a false AC claim, but **operational status file lag** — don’t use it as completion truth.

5. **UI/QA pass oversell**  
   - Spot rows checked **do not** treat Maestro Sync PASS or warm tabs as grant proof / Nightly (good). Continue guarding #721 Stage_D language when promoting.

6. **No false “inferred docs waive AC” found** in spot set  
   - #4/#41 explicitly reject inferred mobile roles doc / closed state as waive.

---

## What this review did **not** do

- Full re-read of all **272** accepted notes.  
- Edit audit files or re-run 308.  
- Credential / device / SA session establishment.  
- Final human audit signoff.

---

## Bottom line

| Layer | Result |
| --- | --- |
| Ledger integrity / dedup / retrieval | **PASS** |
| Complete-row contract awareness | **PASS** |
| High-impact spot claims | **Mostly PASS**; **#49 lineage HOLD**; early-findings #721 **stale HOLD** |
| SuperAdmin in all-role inventory | **HOLD — record unknown explicitly** |
| Signoff | **Preliminary only** — audit still writing (~36 depth pending) |

Sole output: `/tmp/fluent-audit-independent-review.md`.
