# Issue-history reconciliation — FINAL report

**Status: FINAL-frozen** (auth lineage **correction** `2026-10-20T01:59:31Z` — see §3.1b / executive). Prior freeze receipts historical. Ledger **308/308** contract-marked. Independent delta **PASS** (`/tmp/fluent-audit-final-review.md`). Complete ≠ Nightly.

| Field | Value |
| --- | --- |
| Integrator | `bc-da4aa327-d86e-47fc-93c0-d7105af39497` |
| Draft UTC | `2026-10-20T01:35:00Z` |
| Frozen UTC | `2026-10-20T01:59:31Z` (auth correction) |
| HEAD | `5334ff6aa69ae4227332ad2304fa3f8a0c70e7f9` |
| Ledger | `reconciliation_complete` **308 / 308** |
| Issue-ID refresh | `inventory/issue-id-refresh-mattrace.json` — `mattrace-gloo` 308≡308 |
| Executive packet | [`EXECUTIVE-FINDINGS.md`](./EXECUTIVE-FINDINGS.md) |
| Delta PASS | `/tmp/fluent-audit-final-review.md` |
| Freeze receipt | `/tmp/fluent-audit-frozen-final.md` |
| Complete ≠ | Nightly signoff, conformance, or epic DoD |

---

## 1. Scope refresh (read-only, once)

| Check | Result |
| --- | --- |
| Method | `gh api repos/eten-tech-foundation/fluent-mobile/issues?state=all` paginated until empty raw page; exclude `pull_request` key; continue through PR-heavy pages |
| Search cross-check | `search/issues?q=repo:…+is:issue` → `total_count: 308` |
| Live issues excl. PRs | **308** (numbers `1`–`721`) |
| Snapshot `coverage.csv` | **308** |
| New IDs not in snapshot | **none** |
| Snapshot IDs absent from live | **none** |

**Scope:** **308** GitHub issues (excl. PRs) + **356** total issue comments (`sum(coverage.csv comment_count_api)` = 356; cached `inventory/issues/*.json` comments also 356). No new IDs since snapshot. Freeze executed after delta PASS.

---

## 2. How to read this report

| Bucket | Meaning |
| --- | --- |
| **Completed historical review** | Audit row `reconciliation_complete=yes` with cites; may record waivers, named divergences, or open tickets as *findings* |
| **Requirement unimplemented** | Open AC + source still missing / explicitly deferred (**only** when accepted row proves deferred/missing source) |
| **OPEN_BUG / current QA unproven** | Defect AC still open; mitigations may exist; cause and/or current QA unknown — **not** “unimplemented” from open alone |
| **OPEN_followup** | Open ticket/status; label source_gap only if accepted row proves it |
| **Live QA unproven** | Automation or Dev-dated evidence only; **no Nightly signoff** claimed |
| **HISTORICAL waiver** | Dated deferral later superseded by delivery tickets/PRs — not a current open AC |
| **STILL open requirement** | No later waive/delivery; or parent epic remainder after a slice merge |
| **Explicit deferral** | Dated comment/PR names follow-up ID |
| **Named unwaived divergence** | Current behavior differs from original AC; no ticket waive — distinct from OPEN_BUG |
| **Decision open** | Launch/product TBD recorded on ticket — not inferred PM intent |

No PM blame. No inferred intent beyond cited comments/PRs/source.

---

## 3. Cross-issue chronology (deferral → later delivery)

### 3.1 Record scrub / remux — `#49` → `#176` / `#233`

| Step | Citation | Classification |
| --- | --- | --- |
| Original AC | [#49](https://github.com/eten-tech-foundation/fluent-mobile/issues/49) Review scrub on draft waveform | AGREED (layout) |
| HISTORICAL waiver | [PR #158 comment](https://github.com/eten-tech-foundation/fluent-mobile/pull/158#issuecomment-4936939274): seekable scrub → **#176**; remux/native later → **#233** | Explicit deferral (not still-open #49 AC) |
| Delivery | [#176](https://github.com/eten-tech-foundation/fluent-mobile/issues/176) via [PR #252](https://github.com/eten-tech-foundation/fluent-mobile/pull/252); [#233](https://github.com/eten-tech-foundation/fluent-mobile/issues/233) via [PR #254](https://github.com/eten-tech-foundation/fluent-mobile/pull/254) → main with #252 | CONFIRMED_CURRENT_SOURCE on HEAD (`ensureSeekableTakeUri` + `modules/aac-remux`) |
| Ledger hygiene | Accepted #49 row updated: scrub-deferred wording = **HISTORICAL waiver**, not current open requirement | Complete ≠ Nightly scrub QA |

### 3.1b Auth 401 / sign-out — `#41` → `#292`/`#291` + `#622` (correction)

| Step | Citation | Classification |
| --- | --- | --- |
| Original AC | [#41](https://github.com/eten-tech-foundation/fluent-mobile/issues/41) hard 401 clear→Login; sign-out clear DB/caches | Historical AC |
| Delivery | [PR #46](https://github.com/eten-tech-foundation/fluent-mobile/pull/46) Better-Auth login/sign-out | Partial CONFIRMED_CURRENT_SOURCE |
| 401 supersession | [#292](https://github.com/eten-tech-foundation/fluent-mobile/issues/292) closed duplicate of [#291](https://github.com/eten-tech-foundation/fluent-mobile/issues/291) ([comment 5208306644](https://github.com/eten-tech-foundation/fluent-mobile/issues/292#issuecomment-5208306644)); #291 Outcomes require soft reauth / keep token+SQLite / no forced logout; [PR #342](https://github.com/eten-tech-foundation/fluent-mobile/pull/342) | **POLICY SUPERSEDED** — remove “unwaived / no later decision” for this slice |
| Sign-out retention context | [#622](https://github.com/eten-tech-foundation/fluent-mobile/issues/622) + [PR #658](https://github.com/eten-tech-foundation/fluent-mobile/pull/658) | Documented retained recordings + warn UX; **not** new wipe bug; **not** blanket waiver beyond #622 |
| QA | #291 device checks | **QA unproven** / ≠ Nightly — distinct from policy change |
| Correction | `2026-10-20T01:59:31Z` | Final freeze missed this lineage; prior freeze historical |

### 3.2 Source audio stub — `#235` → `#449`

| Step | Citation | Classification |
| --- | --- | --- |
| Stub era | Record/chrome tickets left source dock stub → follow-up **#235** | HISTORICAL deferral |
| Delivery | [PR #449](https://github.com/eten-tech-foundation/fluent-mobile/pull/449) Closes [#235](https://github.com/eten-tech-foundation/fluent-mobile/issues/235) (2026-09-08) | CONFIRMED_CURRENT_SOURCE (`useSourceAudio.ts`, `SourceAudioPlayerBar.tsx`) |
| Residual (not stub re-open) | Issue note: `verseTimestamps=0` seek; fluent-api#282 history | Named limitation; stub AC closed |

### 3.3 Offline claim push slice — `#611` → `#667`; parent `#271` open

| Step | Citation | Classification |
| --- | --- | --- |
| Parent | [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) reconnect claim sync + conflict — **OPEN** | STILL open requirement (remainder) |
| Slice delivery | [#611](https://github.com/eten-tech-foundation/fluent-mobile/issues/611) closed via [PR #667](https://github.com/eten-tech-foundation/fluent-mobile/pull/667) | LATEST_EXPLICIT_DECISION for slice only |
| Source | `src/services/chapterClaimSync.ts` pending-claim push before reconnect upload/refresh | CONFIRMED_CURRENT_SOURCE for #611 AC |
| Do not claim | “#271 done because #667 merged” | Parent remainder separate |

### 3.4 Material accepted findings (executive packet — no new claims)

| ID | Finding | Classification | Cite |
| --- | --- | --- | --- |
| **#4** | Server-filtered `/self/projects` at API pin `4336602` (project grant **or** org-scoped role ≠ Org Member). Mobile has no Manager/Translator client branch — **≠** unfiltered-server / invented client bug. Remaining unknown: “assigned” = project grant vs chapter-assignment-only | Actual source + wording unknown | coverage #4; fluent-api `self-projects.route.ts` / `projects.repository.ts` @ `4336602` |
| **#41** | Original hard 401 clear→Login **POLICY SUPERSEDED** by [#292](https://github.com/eten-tech-foundation/fluent-mobile/issues/292)→[#291](https://github.com/eten-tech-foundation/fluent-mobile/issues/291) ([comment 5208306644](https://github.com/eten-tech-foundation/fluent-mobile/issues/292#issuecomment-5208306644)); delivered [PR #342](https://github.com/eten-tech-foundation/fluent-mobile/pull/342) (soft reauth; keep token+SQLite; no forced logout). Sign-out retention/warning documented [#622](https://github.com/eten-tech-foundation/fluent-mobile/issues/622)+[PR #658](https://github.com/eten-tech-foundation/fluent-mobile/pull/658) — **not** a new DB-wipe bug; do not infer broader waiver beyond #622. Soft-reauth **QA unproven** ≠ Nightly | Policy superseded + documented retention context | coverage #41; PR #46; #291/#292; PR #342; #622; PR #658 |
| **#176** | Remux/scrub **code** on HEAD via PR #252/#254; PR #252 said do not auto-close until Android device QA — **explicit Android QA-before-close evidence missing** | Live evidence gap (code delivered) | coverage #176 |
| **#599** | Foreground upload crash AC **OPEN**; mitigations in source (`UploadSyncForegroundModule.kt`, orchestrator session guard) ≠ closed; cause + **current QA unproven** (Dev historical) — **OPEN_BUG**, not “unimplemented” | OPEN_BUG / current QA unproven | coverage #599 |

---

## 4. `#257` — single consolidated finding

**One framing only** (replaces duplicate README sections):

| Field | Evidence |
| --- | --- |
| Classification | **Known unimplemented requirement** + **launch decision open** — **not** a newly discovered regression from open state |
| Requirement | [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) — durable offline stage-advance queue; reconnect sync via `PATCH .../submit` |
| Current source | [`src/services/stageAdvance.ts:8-40`](../../../src/services/stageAdvance.ts) — local update then best-effort submit; offline/fail logs **"sync deferred to #257"** / **"Offline queue persistence is #257"** |
| Decision (explicit) | [Eng note 2026-08-12](https://github.com/eten-tech-foundation/fluent-mobile/issues/257#issuecomment-5273627839): mobile queue + submit endpoint; **launch blocker TBD with product** |
| Severity context (HISTORICAL device) | [#529](https://github.com/eten-tech-foundation/fluent-mobile/issues/529) Gap 7; [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530) Gap 8 — Dev Xiaomi / `dev.api` dated evidence — **not** current Nightly reverify |
| Priority | `P1_current` known gap; distinct from crash/race **bugs** |

---

## 5. `#721` Sync entry — automation evidence (not Nightly)

| Stage | Result | Citation |
| --- | --- | --- |
| A | Bridge/stale-module sole-blocker hypothesis | Historical |
| B | Live Metro; Maestro stayed Home | Sync lead debug `2026-10-19_174838` |
| C | `adb` tap → Sync screen; no occluder | `inventory/sync721-reconnect-receipt.md` |
| D | Focused Maestro **PASS** EXIT=0 ~**61s** | `inventory/sync721-maestro-correction-receipt.md`; `docs/assessments/maestro-sync721/README.md` |
| Package / session | user**10** / PID**7152**; HEAD `c81bd86…` (receipt); **no app code change** | Same receipts |
| Cause | Settle vs `point: 50%,50%` vs retry **unisolated**; prior fail and pass both ~985,168 — **not** wrong-coords claim; **not** proven product fix | Stage_D note |

**Related local checkpoints (existing-session, read-only; no Nightly signoff):**

| Checkpoint | Outcome | Doc |
| --- | --- | --- |
| Sync | PASS ~61s | `docs/assessments/maestro-sync721/README.md` |
| Prepare Offline entry→back (PFO) | PASS ~**52s** | `docs/assessments/maestro-existing-session/README.md` |
| Privacy (drawer) | PASS ~**32s** | `docs/assessments/maestro-settings-privacy-existing-session/README.md` |
| Terms | PASS ~**31s** | `docs/assessments/maestro-settings-terms-existing-session/README.md` |

All four checkpoints remain **local**. Privacy/Terms Timing **completed**. **No Nightly signoff.**

`integrator-early-findings.json` Stage_B “Maestro FAIL sync-screen” is **HISTORICAL** and **superseded** by Stage_D PASS; earlier failure preserved under `summary_HISTORICAL_Stage_B`.

---

## 6. Role / account inventory (source audit — no logins required)

Configured identities from [`.env.maestro.qa.example`](../../../.env.maestro.qa.example) comments + keys (passwords blank in template):

| Alias / email | Template key | Audit status |
| --- | --- | --- |
| `qa+fluentqa-translator@fluent.local` | `MAESTRO_EMAIL` | **CACHED session only** in Sync/PFO/Privacy/Terms receipts: `active_user_id=10` / `userId=10` / that email — **not** Nightly; **not** multi-role proof |
| `qa+fluentqa-translator2@fluent.local` | `MAESTRO_TRANSLATOR2_EMAIL` | **UNVERIFIED role** (no session/grant proof in this audit) |
| `qa+fluentqa-pm@fluent.local` | `MAESTRO_PM_EMAIL` | **UNVERIFIED role** |
| `qa+fluentqa-observer@fluent.local` | `MAESTRO_EMAIL_2` | **UNVERIFIED role** |
| `qa+fluentqa-om@fluent.local` | `MAESTRO_EMAIL_3` | **UNVERIFIED role** |
| `qa+fluentqa-sa@fluent.local` (SA / SuperAdmin candidate) | Comment-only (“spare / role visibility”); **no `MAESTRO_*_SA` key** | **UNVERIFIED candidate only** — do **not** omit because key missing; **no** verified SA identity, session, or grant in this audit |

Guide cross-ref: [`docs/guides/maestro-role-coverage.md`](../../guides/maestro-role-coverage.md) agent-emulator note for user **10** — explicitly **not** human Nightly QA.

Accounts are **not** required to finish the source/history audit.

---

## 7. Prioritized gaps (concise; citations only)

| Pri | Item | Type | Exact cites |
| --- | ---: | --- | --- |
| P1_current | Offline stage queue | Unimplemented requirement + launch decision open | [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257), [comment](https://github.com/eten-tech-foundation/fluent-mobile/issues/257#issuecomment-5273627839), `stageAdvance.ts:8-40` |
| P1_provisional | Claim reconnect remainder | Open parent after slice | [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271); slice [#611](https://github.com/eten-tech-foundation/fluent-mobile/issues/611) / [PR #667](https://github.com/eten-tech-foundation/fluent-mobile/pull/667) |
| P1_provisional | Sync entry automation | Live QA unproven / cause unisolated | [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721); Stage_D receipts (~61s PASS) |
| P1_provisional | Upload foreground crash | OPEN_BUG; mitigations present; cause + current QA unproven | [#599](https://github.com/eten-tech-foundation/fluent-mobile/issues/599) |
| — | #176 Android QA-before-close | Code delivered; QA evidence missing | [#176](https://github.com/eten-tech-foundation/fluent-mobile/issues/176) / PR #252 |
| — | #41 hard 401→Login | **Superseded** by #291/#292 + PR #342; soft-reauth QA unproven | [#291](https://github.com/eten-tech-foundation/fluent-mobile/issues/291) / [#292](https://github.com/eten-tech-foundation/fluent-mobile/issues/292) |
| — | Sign-out recording retention / warn UX | Documented #622 + PR #658 (not new wipe bug) | [#622](https://github.com/eten-tech-foundation/fluent-mobile/issues/622) |
| — | #4 assignment wording | Unknown project-grant vs chapter-only (server filtered) | [#4](https://github.com/eten-tech-foundation/fluent-mobile/issues/4) |
| P1_provisional | Observer entry / offline draft download | Open AC + source_gap (accepted row) | [#505](https://github.com/eten-tech-foundation/fluent-mobile/issues/505), [#508](https://github.com/eten-tech-foundation/fluent-mobile/issues/508) |
| P1_provisional | Fixture/seed blockers | OPEN_followup + API seed deps | [#607](https://github.com/eten-tech-foundation/fluent-mobile/issues/607), [#717](https://github.com/eten-tech-foundation/fluent-mobile/issues/717); do not conflate mobile #368/#369 with fluent-api seeds |
| P1_provisional | Gallery / sync FR batch | OPEN_followup; source_gap only where accepted row proves | [#694](https://github.com/eten-tech-foundation/fluent-mobile/issues/694)–[#696](https://github.com/eten-tech-foundation/fluent-mobile/issues/696), [#701](https://github.com/eten-tech-foundation/fluent-mobile/issues/701), [#703](https://github.com/eten-tech-foundation/fluent-mobile/issues/703), [#704](https://github.com/eten-tech-foundation/fluent-mobile/issues/704), [#716](https://github.com/eten-tech-foundation/fluent-mobile/issues/716) (r17) |
| P1_provisional | Grant chrome vs 403 | Product decision open | Living `roles-and-permissions.md` (read-only cite); no new decision invented here |
| — | Historical Dev audit Fails | HISTORICAL_DEVICE_EVIDENCE | [#529](https://github.com/eten-tech-foundation/fluent-mobile/issues/529), [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530) / PRs #577/#598 — not Nightly |

---

## 8. Freeze checklist

- [x] Integrate r16 + r17 → **308/308** audit rows (still ≠ Nightly)
- [x] Close independent review HOLDs (SA in README; #49 chronology+#252/#233; #721 FAIL→historical; cohort-status; cite fixes #49/#109)
- [x] Privacy/Terms Timing completed
- [x] Independent **delta** review of `/tmp/fluent-audit-final-corrections.md` → **PASS** (`/tmp/fluent-audit-final-review.md`)
- [x] Promote DRAFT → FINAL; classification wording (#599 OPEN_BUG; Gallery open-followup) absorbed; `/tmp` reviewer outputs preserved under `inventory/provenance/frozen-final/`

## 9. Artifacts

| Path | Role |
| --- | --- |
| `coverage.csv` | Ledger **308/308** |
| `FINAL-report.md` | This FINAL report |
| `EXECUTIVE-FINDINGS.md` | Concise source-linked packet |
| `inventory/executive-findings.json` | Structured twin |
| `inventory/completion-counts.json` | Counts |
| `inventory/issue-id-refresh-mattrace.json` | 308≡308 refresh |
| `inventory/provenance/frozen-final/` | Copied safe receipts + `SHA256SUMS` |
| `/tmp/fluent-audit-final-corrections.md` | Readiness receipt (pre-delta) |
| `/tmp/fluent-audit-final-review.md` | Independent delta PASS |
| `/tmp/fluent-audit-frozen-final.md` | Freeze deliverables receipt |
