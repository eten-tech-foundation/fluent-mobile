# Issue history reconciliation (exclusive audit workspace)

**Status: FINAL-frozen** (auth lineage correction `2026-10-20T01:59:31Z` — #41 401 slice superseded by #291/#292+PR342; see FINAL §3.1b; prior freeze `2026-10-20T01:40:25Z` historical). Ledger **308/308**. Independent delta **PASS** (historical). Complete≠Nightly.
**FINAL report:** [`FINAL-report.md`](./FINAL-report.md) · Executive packet: [`EXECUTIVE-FINDINGS.md`](./EXECUTIVE-FINDINGS.md) + [`inventory/executive-findings.json`](./inventory/executive-findings.json). Issue-ID refresh (`mattrace-gloo`): **308≡308**.
**HEAD (frozen):** `5334ff6aa69ae4227332ad2304fa3f8a0c70e7f9`.

## Task identity

| Field | Value |
| --- | --- |
| Cursor agent ID | `bc-da4aa327-d86e-47fc-93c0-d7105af39497` |
| Run URL | https://cursor.com/agents/bc-da4aa327-d86e-47fc-93c0-d7105af39497 |
| Repo (live) | `/Users/matt/Documents/Development/gloo/fluent-mobile` |
| Branch | `mrace/chore/717-build-out-full-maestro-e2e-coverage` |
| HEAD (final corrections) | `5334ff6aa69ae4227332ad2304fa3f8a0c70e7f9` |
| GitHub login | `mattrace-gloo` |
| Stale agent NOT resumed | `01a154f9-8d5b-72e0-b6e1-d0d5e3c7e01e` |
| Output ownership | **This directory only** |

## Constraints (honored)

- NOT backlog recovery
- Canonical `docs/product-behavior/` + all code: **READ ONLY**
- No staging / commits / push / public GitHub mutations
- No devices / adb / Maestro / Metro / auth / token reads
- Emulator: Sync #721 agent; index: checkpoint worker
- Parallel cohorts write **only** `/tmp/fluent-issue-review-cN.*`; integrator alone merges here

## Inventory snapshot

| Metric | Value |
| --- | --- |
| Snapshot UTC | `2026-10-20T00:33:19Z` |
| API pages (`per_page=100`) | `8` |
| Total unique issues (PRs excluded) | `308` |
| Open | `48` |
| Closed | `260` |
| Number range | `1–721` |

## Progress counters (milestone 2026-10-20T00:51:04Z)

| Counter | Value |
| --- | --- |
| Issues in ledger | 308 |
| Bodies retrieved | 308 / 308 |
| Comments retrieval complete (count match) | 308 / 308 |
| Disposition review (body+comments; cohort/integrator) | **308 / 308** |
| **Reconciliation complete** (source/decision/product-decision evidence) | **308 / 308** |
| Awaiting reconciliation depth | **0** |
| No disposition yet | **0** |

**Honesty:** prior scripted 308 claim **rejected** then rebuilt via contract waves. Ledger now **308/308** audit-complete (`inventory/completion-counts.json`). **Complete ≠ QA/conformance/Nightly pass**. Cite hygiene: #49 → `src/audio/micPermission.ts`. #109 optional `src/config/env.ts` = **valid absence** (unimplemented optional AC) — not a broken cite. #721 Stage_B FAIL is **HISTORICAL** — superseded by Stage_D Maestro PASS ~61s (earlier failure preserved). Local checkpoints: Sync ~61s / PFO ~52s / Privacy ~32s / Terms ~31s — **Privacy/Terms Timing completed**. Extra worker ignored for completes.

### Role inventory (explicit SA / SuperAdmin)

| Identity | Status |
| --- | --- |
| `qa+fluentqa-translator@fluent.local` (user **10**) | **Only cached session** in Sync/PFO/Privacy/Terms receipts — not Nightly; not multi-role proof |
| `qa+fluentqa-translator2@fluent.local` | **UNVERIFIED role** (template key present; no session/grant in this audit) |
| `qa+fluentqa-pm@fluent.local` | **UNVERIFIED role** |
| `qa+fluentqa-observer@fluent.local` | **UNVERIFIED role** |
| `qa+fluentqa-om@fluent.local` | **UNVERIFIED role** |
| `qa+fluentqa-sa@fluent.local` (**SA / SuperAdmin candidate**) | **UNVERIFIED candidate only** — listed in [`.env.maestro.qa.example`](../../../.env.maestro.qa.example) comment (“spare / role visibility”); **no** `MAESTRO_*_SA` key; **no** verified SA identity, session, or live grants. **Do not omit** because the template key is missing. |

Source: `.env.maestro.qa.example` L7–13; receipts cite user10 only. Accounts not required for source audit.

### Cohort ownership (non-overlapping IDs; transfer rules)

Exact partition: six cohorts, **308 unique IDs**, set-equal to inventory (integrity check passed).

| Cohort | Count | Original reviewer | Status | Integrated |
| --- | ---: | --- | --- | --- |
| c1 | 52 | `bc-09eeb8c0-8b52-57ab-9eb9-fc4b581379c1` | completed `/tmp` (**protected**) | **yes** (disposition) |
| c2 | 52 | `bc-88f22bad-8ee6-51f8-b701-38e0b437c209` | `/tmp` present | **yes — disposition only** |
| c3 | 52 | `bc-cf02a792-6bc8-53bc-9b0a-1c50ccc2f0b2` | completed `/tmp` (**protected**) | **yes** (disposition) |
| c4 | 52 | `bc-219f5782-1d17-5f67-87ad-36fd1b886e57` | completed `/tmp` (**protected**) | **yes** (disposition) |
| c5 | 52 | `bc-4aa6c5a3-9e01-5b1c-ae4a-c769c6df9d4e` | `/tmp` present | **yes — disposition only** |
| c6 | 48 | `bc-72933aea-7310-5fcf-b09d-bd0937573a32` | completed `/tmp` (**protected**) | **yes** (disposition) |

**Extra worker [`bc-11ead3e6-…`](https://cursor.com/agents/bc-11ead3e6-8b3e-5411-be2c-816c3927504d):** STOP requested / unacked earlier; **do not use** for ownership.

Copies: [`inventory/cohort-integrations/`](./inventory/cohort-integrations/). Status: [`inventory/cohort-status.json`](./inventory/cohort-status.json). Ownership: [`inventory/cohort-ownership.json`](./inventory/cohort-ownership.json).

Taxonomy: [`inventory/disposition-taxonomy.md`](./inventory/disposition-taxonomy.md).

### Major blockers

1. Keyword engines remain **retired**. Ledger 308/308 audit-complete; FINAL frozen after delta PASS.
2. **FINAL** — see [`FINAL-report.md`](./FINAL-report.md); freeze receipt `/tmp/fluent-audit-frozen-final.md`.
3. Priority labels must separate **CONFIRMED_CURRENT_SOURCE** from **HISTORICAL_DEVICE_EVIDENCE** / Nightly.
4. **#721** Stage_D Maestro helper PASS — cause unisolated; Stage_B FAIL preserved as historical only; **not** Nightly signoff.

## Prioritized findings (source-linked; not full 308)

**Canonical FINAL:** [`FINAL-report.md`](./FINAL-report.md) (chronology, role inventory, gaps). Summary below kept for navigation.

**Cohort merge policy:** disposition from c1–c6; reconciliation_complete only after integrator source/decision evidence. **#721** Stage_B reconnect supersedes earlier bridge-sole `NO_PRODUCT_FIX`. **#611** PR #667 later-merge nuance retained. c4 ID-collision hygiene (#368/#369/#484 vs API/fixture namespaces) accepted.

Agent-integrator verified only. Each item keeps: original requirement → latest explicit decision → current source → device evidence → disposition.  
`shipping/main` (or this branch HEAD) ≠ deployed QA. Later explicit decision wins; no inferred PM intent.

### P1_current — `#257` known unimplemented offline stage queue (launch decision open)

| Field | Evidence |
| --- | --- |
| Framing | **Known unimplemented requirement** + **launch decision open** — **not** a newly discovered regression from open state; **not** framed as a fresh bug |
| Requirement | [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) — persist stage advance offline; sync on reconnect via `PATCH .../submit` |
| Latest explicit decision | Eng note [2026-08-12](https://github.com/eten-tech-foundation/fluent-mobile/issues/257#issuecomment-5273627839): mobile queue + submit endpoint; **launch blocker TBD with product** (not a closed waive) |
| Current source | [`src/services/stageAdvance.ts:8-40`](../../../src/services/stageAdvance.ts) — local update then best-effort submit; offline/fail logs **"sync deferred to #257"** / **"Offline queue persistence is #257"**. No durable offline stage queue |
| Device evidence | **HISTORICAL** Dev: [#529](https://github.com/eten-tech-foundation/fluent-mobile/issues/529) Gap 7, [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530) Gap 8 — severity context only; **not** Nightly reverify |
| Priority | `P1_current` known gap; distinct from crash/race bugs |

### P1_provisional — `#271` claim reconnect (post-`#611` / PR `#667` slice); not current P0 from dated Dev Fail

| Field | Evidence |
| --- | --- |
| Original requirement | [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) — reconnect claim sync + conflict surfacing (**OPEN** remainder) |
| Latest explicit decision | Slice [#611](https://github.com/eten-tech-foundation/fluent-mobile/issues/611) closed via [PR #667](https://github.com/eten-tech-foundation/fluent-mobile/pull/667). Related [#610](https://github.com/eten-tech-foundation/fluent-mobile/issues/610) / PR #653. **#271 remains open** |
| Current source | [`src/services/chapterClaimSync.ts`](../../../src/services/chapterClaimSync.ts) — pending-claim push path present for #611 AC |
| Device evidence | **HISTORICAL** Dev pre-#667 — **not** re-verified Nightly |
| Priority | `P1_provisional`; **not** `P0_current` |

### P1_provisional — `#721` Sync entry (four dated stages; Stage_D focused Maestro PASS ~61s)

| Field | Evidence |
| --- | --- |
| Original requirement | [#38](https://github.com/eten-tech-foundation/fluent-mobile/issues/38) / [#149](https://github.com/eten-tech-foundation/fluent-mobile/issues/149) — cloud icon → Sync |
| Stages A–D | See [`FINAL-report.md`](./FINAL-report.md) §5 + [`inventory/sync721-maestro-correction-receipt.md`](./inventory/sync721-maestro-correction-receipt.md): Stage_D PASS ~61s; cause **unisolated**; **not** proven product fix; **no Nightly signoff** |
| Related local checkpoints | PFO ~52s; Privacy ~32s; Terms ~31s — Timing **completed**; all local |
| Priority | `P1_provisional` Maestro-helper; **not** `P0_current` Sync source defect |

### Chronology (HISTORICAL waiver ≠ still-open AC)

- **#49** scrub deferred → later **#176/#233** via PR **#252/#254** (ledger note updated).
- **#235** stub → later PR **#449**.
- Details: [`FINAL-report.md`](./FINAL-report.md) §3.

### `#4` project list filtering — layout vs permission; pinned API policy

| Field | Evidence |
| --- | --- |
| Requirement split | [#4](https://github.com/eten-tech-foundation/fluent-mobile/issues/4): **permission** Manager-all-org / Translator-assigned; **layout** list chrome (superseded by #31/#32/#333) |
| Mobile client | No Manager/Translator branch — **does not prove** server `/self/projects` is unfiltered |
| API pin `4336602` | [`self-projects.route.ts`](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/src/domains/self/projects/self-projects.route.ts) → `getProjectsByUserId`; [`projects.repository.ts` `getByUserId`](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/src/domains/projects/projects.repository.ts): project grants **or** org-scoped roles where `roles.name != 'Org Member'`. [permissions.md](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/docs/permissions.md): Org Manager org-wide `project:view`; Project Translator project-scoped |
| Server guarantee | Membership/grant list matching that query — **not** unfiltered all-projects; **not** chapter-slot list |
| Remaining unknown | Whether #4 “Translator assigned” meant **project grant** (server yes) vs **chapter-assignment-only** (different system) |
| Disposition | Not “new product decision because client lacks role branch.” Layout settled; wording unknown recorded |

### P1_provisional — Open-peer / conflict / claim-pool fixtures (`#607` / `#532` / `#717`)

| Field | Evidence |
| --- | --- |
| Original / decision | [#532](https://github.com/eten-tech-foundation/fluent-mobile/issues/532) Pass-with-gaps; scenarios 21–23 BLOCKED. [#607](https://github.com/eten-tech-foundation/fluent-mobile/issues/607) open for seeds. [#717](https://github.com/eten-tech-foundation/fluent-mobile/issues/717) keeps those Maestro flows BLOCKED until seed (fluent-api #368/#369 — **API** tickets, not mobile #368/#369) |
| Current source | Not a single client bug; fixture/API seed dependency |
| Device evidence | Dev Maestro audit dated 2026-09; living roles doc: live grant allow/deny still 0 |
| Disposition | **OPEN_TICKET_UNRESOLVED** + product/API dependency; **PROVISIONAL** for launch proof |
| Priority | `P1_provisional` |

### P1_provisional — Mobile grant chrome vs server 403 (open product decision)

| Field | Evidence |
| --- | --- |
| Latest explicit decision | [roles-and-permissions.md](../../product-behavior/roles-and-permissions.md) **Open product decision** — hide chrome by grant vs server 403 only. No later ticket in the early set closes this as agreed AC |
| Current source | Inferred: grants not persisted; Sync chrome not grant-gated (`HomeScreen` → sync push) |
| Device evidence | QA Resources empty on 484 = **valid empty UI fixture** only — no HTTP 403 conclusion |
| Disposition | Open product decision; **PROVISIONAL** |
| Priority | `P1_provisional` |

### P2 / hygiene

- [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530) audit **Fail** is **HISTORICAL** Dev-dated; assessment README superseded notice → product-behavior. Do not conflate with QA #721 or claim Nightly signoff.
- [#256](https://github.com/eten-tech-foundation/fluent-mobile/issues/256): Claude body cautioned; eng note [2026-08-12](https://github.com/eten-tech-foundation/fluent-mobile/issues/256#issuecomment-5273845866) → fluent-api joint ship. Not automatic product AC.
- [#292](https://github.com/eten-tech-foundation/fluent-mobile/issues/292) → duplicate of [#291](https://github.com/eten-tech-foundation/fluent-mobile/issues/291) (2026-08-06); later decision wins.
- [#599](https://github.com/eten-tech-foundation/fluent-mobile/issues/599) still open; Dev crash evidence historical — treat as **OPEN_TICKET** + **HISTORICAL_DEVICE_EVIDENCE** until reverify (`P1_provisional`).
- Epic [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526) still open; sub-audits mixed.

## Artifacts

| File | Purpose |
| --- | --- |
| [`EXECUTIVE-FINDINGS.md`](./EXECUTIVE-FINDINGS.md) | Concise source-linked executive packet |
| [`inventory/executive-findings.json`](./inventory/executive-findings.json) | Structured twin |
| [`FINAL-report.md`](./FINAL-report.md) | DRAFT chronology — **not FINAL** |
| [`coverage.csv`](./coverage.csv) | Issue-by-issue ledger **308/308** |
| [`inventory/completion-counts.json`](./inventory/completion-counts.json) | Counts |
| [`inventory/cohort-status.json`](./inventory/cohort-status.json) | Cohort/wave status (c2/c5 completed historical) |
| [`inventory/integrator-early-findings.json`](./inventory/integrator-early-findings.json) | #721 FAIL historical / Stage_D current |
| [`inventory/issue-id-refresh-mattrace.json`](./inventory/issue-id-refresh-mattrace.json) | Live 308≡308 refresh |
| [`inventory/complete-row-contract.md`](./inventory/complete-row-contract.md) | Complete-row contract v1 |
| `/tmp/fluent-audit-final-corrections.md` | Pre-delta readiness receipt |
| `/tmp/fluent-audit-final-review.md` | Independent delta **PASS** |
| `/tmp/fluent-audit-frozen-final.md` | Freeze deliverables receipt |
| [`inventory/provenance/frozen-final/`](./inventory/provenance/frozen-final/) | Copied safe receipts + SHA256SUMS |

## Method notes

- Retrieval completeness = cached comments length equals GitHub `issue.comments`.
- Substantive review = **agent integrator** (or cohort draft + agent-integrator verification) read of body + all comments + decision ordering + docs/impl crosscheck where relevant. **Not** a human review unless separately attested.
- Keyword bucketing is triage only and **never** sets `reconciliation_complete=yes`.
- Priority: prefer evidence depth over marking rows “done.”
- Exhaustive-finished: all 308 contract-complete **and** FINAL frozen `2026-10-20T01:40:25Z` after delta PASS + r16/r17.

---
*Last updated: 2026-10-20T01:40:25Z UTC*
