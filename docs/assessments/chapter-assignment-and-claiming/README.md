# Chapter assignment and claiming Audit

## Overview

**Feature:** Chapter assignment and claiming  
**Auditor:** Matt Race (`@mattrace-gloo` / `@mattrace-buildmidwestern`)  
**Date tested:** 2026-09-23  
**Build/version:** Android Debug / expo-dev-client (`com.eten.fluent`) + Metro (`EXPO_PUBLIC_E2E_MODE=1`) on SDK 57  
**Environment:** `https://dev.api.fluent.bible` (Maestro translator account)  
**Device and OS:** Android Emulator `emulator-5554` (Maestro Pixel 6 / API 33)  
**App-observed connectivity:** Online (`Online · all synced` on Sync)  
**Account:** Maestro translator (`mrace+t@gloo.us` — no secrets)  
**Audit sub-issue:** [#532](https://github.com/eten-tech-foundation/fluent-mobile/issues/532) (epic [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526))

## Scope

Online chapter ownership UI, taken-chapter Record warning, stage-aware assignment clearing, and online claim surfaces for Draft / Peer Check. Offline claim and reconnect claim sync are sibling audit [#533](https://github.com/eten-tech-foundation/fluent-mobile/issues/533) (tracked here as deliberate SKIPPED coverage).

## Related Issues

- [#267](https://github.com/eten-tech-foundation/fluent-mobile/issues/267) — Chapter ownership indicator (historical)
- [#268](https://github.com/eten-tech-foundation/fluent-mobile/issues/268) — Online claim on first recording (closed; implementation present; E2E still missing)
- [#269](https://github.com/eten-tech-foundation/fluent-mobile/issues/269) — Recording warning on taken chapters (+ conflict banner half)
- [#270](https://github.com/eten-tech-foundation/fluent-mobile/issues/270) — Offline claim on first recording
- [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) — Reconnect claim sync and conflict detection
- [#273](https://github.com/eten-tech-foundation/fluent-mobile/issues/273) — Related assignment/claim history
- [#442](https://github.com/eten-tech-foundation/fluent-mobile/issues/442) — Implicit Peer Checker assignment / open Peer Check model
- [#476](https://github.com/eten-tech-foundation/fluent-mobile/issues/476) — Stage-aware assignment indicator
- [#533](https://github.com/eten-tech-foundation/fluent-mobile/issues/533) — Sibling: Offline chapter assignment audit
- [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526) — Mobile Feature Audit epic
- [#574](https://github.com/eten-tech-foundation/fluent-mobile/issues/574) — **New:** Maestro E2E + safe fixtures for ownership / taken warning / online claim

## Expected Behavior

Translators working online should:

- See ownership state on My Work and project chapter lists: **mine**, **assigned to another translator**, or **unassigned** (no icon)
- See stage-aware clearing (no ownership icon on Advanced Check / Complete where applicable)
- See `record-taken-warning` on Record when the chapter is taken by another translator (Draft and Peer Check), without blocking recording
- Auto-claim an unassigned chapter on first successful online recording, with ownership UI updating to mine
- Surface claim-conflict indicators when multi-claimant conflicts exist (list + Record banner)
- Support open Peer Check (no peerChecker) without a false taken warning / ownership icon

## Test Results

Interactive Maestro MCP on `emulator-5554` against live Debug Dev Client + Metro. No durable ownership/claim Maestro flow was added during this audit (coverage gap tracked as [#574](https://github.com/eten-tech-foundation/fluent-mobile/issues/574)).

### Coverage counts

| Metric | Count |
| --- | --- |
| Planned | 24 |
| Pass | 15 |
| Fail | 0 |
| Blocked | 4 |
| Skipped | 5 |

15 + 0 + 4 + 5 = 24

### Scenario matrix

| # | Scenario | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| 1 | Lab + authenticated Home | Dev Client + hierarchy usable | Metro + hierarchy proved | Pass |
| 2 | My Work shows assignments | ≥1 assigned chapter | Genesis/Exodus rows present | Pass |
| 3 | My Work “mine” ownership icon | a11y `Assigned to you` | Confirmed | Pass |
| 4 | Project list “mine” ownership | Mine icon on own chapters | Genesis 1 / Mark 1 | Pass |
| 5 | Project list “other” ownership | `Assigned to another translator` | 3 John 1, Mark 9/10, 2 John 1 | Pass |
| 6 | Project list unassigned (no icon) | No ownership a11y | Genesis 9 / Mark 3–8 Not Started | Pass |
| 7 | Mine chapter → Record: no taken warning | `record-taken-warning` absent | Absent; start enabled | Pass |
| 8 | Taken Draft → Record: warning shown | Banner + copy | 3 John 1; copy matches #269 | Pass |
| 9 | Taken chapter: record still enabled | Start control present | `record-start-button` present | Pass |
| 10 | Unassigned → Record: no taken warning | No banner | Genesis 9 Not Started | Pass |
| 11 | Peer Check + other assignee → taken warning | Banner on Peer Check | 2 John 1 | Pass |
| 12 | Advanced/Complete: no ownership icon | Icons cleared | 1 John 1–5 | Pass |
| 13 | App-observed online for claim surfaces | Online connectivity | Sync a11y Online | Pass |
| 14 | Sync healthy; My Work still assigned | Idle sync; assignments persist | Sync idle · assignments persist | Pass |
| 15 | My Work ↔ Project consistency (Genesis 1) | Same chapter mine both places | Same `33212`, mine both places | Pass |
| 16 | Online auto-claim on first recording | Claim + mine UI | Not attempted (shared-data mutation; no disposable fixture) | Skipped |
| 17 | Claim updates row to mine immediately | Immediate ownership update | Depends on #16; not attempted | Skipped |
| 18 | Online multi-claim race / claim conflict UI | Conflict UI | Destructive; also tracked by #271 | Skipped |
| 19 | Offline claim on first recording | Offline claim path | Deliberately deferred to sibling #533 / #270 | Skipped |
| 20 | Reconnect claim sync + conflict clear | Reconnect sync | Deliberately deferred to sibling #533 / #271 | Skipped |
| 21 | Open Peer Check (no peerChecker): no icon / no banner | Open Peer Check UX | Intended; no seed after Gujarati + Source Audio scan | Blocked |
| 22 | Chapter-list conflict indicator (#260) live | Conflict list chrome | Intended; no conflicted chapter in seed | Blocked |
| 23 | Record conflict warning banner (#269) | Conflict Record banner | Same fixture gap as #22 | Blocked |
| 24 | Cross-account ownership (B sees A as other) | Account B sees A chapters as other | Intended; Account B add blocked by credential/approval boundary | Blocked |

## Offline and Synchronization Results

Offline claim and reconnect claim sync belong to sibling audit [#533](https://github.com/eten-tech-foundation/fluent-mobile/issues/533). This audit exercised **online** ownership / taken-warning surfaces only.

| Scenario | Result | Notes |
| --- | --- | --- |
| Feature used while offline | N/A | Sibling #533 |
| App closed and reopened offline | N/A | Sibling #533 |
| Device returns online | N/A | Sibling #533 / #271 |
| Offline changes synchronize | N/A | Sibling #533 |
| Conflicting changes are handled | N/A / Blocked online | Online conflict UI BLOCKED (no seed); reconnect conflict is #271 + #533 |

## Product findings

No confirmed product failures on the exercised online ownership / taken-warning paths.

Observed behavior matched the online assignment contract for scenarios that ran:

- Ownership icons: mine / other / unassigned
- Stage-aware clearing on Advanced Check / Complete
- Taken warning on Record when assigned to another translator (Draft + Peer Check)
- Recording remains enabled when taken
- Unassigned / mine chapters show no taken warning

Incomplete coverage (BLOCKED / SKIPPED) is **not** treated as a product FAIL.

## Blocked / skipped coverage

**BLOCKED** (intended coverage; execution prevented):

| Scenario | Why blocked |
| --- | --- |
| Open Peer Check (no peerChecker) | No deterministic seed chapter after project scans |
| Chapter-list conflict indicator | No conflicted chapter in seed data |
| Record conflict warning banner | Same missing conflict fixture |
| Cross-account ownership (B sees A as other) | Account B not on device; credential add blocked by agent approval boundary |

**SKIPPED** (deliberately not attempted before execution):

| Scenario | Why skipped |
| --- | --- |
| Online auto-claim on first recording | Policy: would mutate shared developer/QA data; no approved disposable fixture |
| Claim updates row to mine immediately | Depends on auto-claim; same policy |
| Online multi-claim race / conflict UI | Destructive shared-state mutation; product path also tracked by #271 |
| Offline claim on first recording | Sibling audit #533 / product #270 |
| Reconnect claim sync + conflict clear | Sibling audit #533 / product #271 |

## Existing automated coverage

**Maestro:** Smokes cover nav / record / sync / auth / multi-account. None assert ownership icons, `record-taken-warning`, or claim. Assignment is only a seed prerequisite.

**Unit / integration (strong):** `chapterOwnershipState`, `chapterTakenStatus`, `chapterClaimSync`, `chapterClaimsRepository`, `api.chapterClaim`, `RecordTab` taken-warning tests, `useVerseAudio` offline-claim test, Sync claim-error paths.

**Gap:** Unit proves claim/ownership logic; no E2E proves online auto-claim or ownership/taken-warning UX on device.

## Coverage gaps

1. No Maestro coverage for ownership states or `record-taken-warning`
2. Online auto-claim (#268) unproven on device (destructive without fixtures)
3. Conflict UI (#260 / #269) unproven without conflict seed
4. Open Peer Check (#442 / #476) unproven without unassigned Peer Check seed
5. Offline / reconnect claim deferred to #533

## Gaps Identified

### Missing Maestro E2E + resettable ownership/claim fixtures

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#268](https://github.com/eten-tech-foundation/fluent-mobile/issues/268) (closed implementation), [#269](https://github.com/eten-tech-foundation/fluent-mobile/issues/269), [#442](https://github.com/eten-tech-foundation/fluent-mobile/issues/442), [#476](https://github.com/eten-tech-foundation/fluent-mobile/issues/476)  
**Development task:** [#574](https://github.com/eten-tech-foundation/fluent-mobile/issues/574) · [tickets/maestro-ownership-claim-fixtures.md](./tickets/maestro-ownership-claim-fixtures.md)

**Description:**  
#532 proved live ownership / taken-warning UI for seeded states, but Maestro has zero assertions on those states, and claim/conflict/open-Peer-Check paths cannot be safely or deterministically exercised against shared `dev.api.fluent.bible` data without resettable fixtures.

**Steps to reproduce:**

1. Run existing Maestro smokes — observe assignment only as a seed prerequisite.
2. Attempt online first-recording auto-claim on shared project data — policy forbids mutation.
3. Search seed for conflicted / open Peer Check chapters — none available during this audit.

**Expected behavior:**  
Disposable/resettable fixtures + Maestro coverage for mine/other/unassigned, taken warning, online auto-claim, conflict, and open Peer Check.

**Actual behavior:**  
15 live PASSes on existing seeds; 4 BLOCKED / 5 SKIPPED for fixture/policy/sibling-scope reasons; no product FAIL on exercised paths.

**Evidence:**  
Interactive #532 Maestro MCP run on `emulator-5554` (2026-09-23). See scenario matrix above.

## Existing issues (open product paths)

| Issue | Why it remains relevant |
| --- | --- |
| [#269](https://github.com/eten-tech-foundation/fluent-mobile/issues/269) | Taken warning half confirmed working; conflict banner half still unproven (BLOCKED fixture) |
| [#270](https://github.com/eten-tech-foundation/fluent-mobile/issues/270) | Offline claim — sibling #533 |
| [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) | Reconnect claim sync / conflict — sibling #533 |
| [#442](https://github.com/eten-tech-foundation/fluent-mobile/issues/442) | Open Peer Check model; PM-assigned Peer Check taken path confirmed |
| [#476](https://github.com/eten-tech-foundation/fluent-mobile/issues/476) | Stage-aware icons confirmed on Advanced/Complete + Peer Check other |
| [#533](https://github.com/eten-tech-foundation/fluent-mobile/issues/533) | Offline assignment audit owns offline/reconnect scenarios |

## New actionable issue

[#574](https://github.com/eten-tech-foundation/fluent-mobile/issues/574) — Maestro E2E + safe fixtures for chapter ownership, taken warning, and online claim  
Project 4 status: **Dev Ready**

## Open Questions

- None that block closing the audit after this assessment merges. Remaining incomplete paths are tracked via existing product issues + #574.

## Confidence

**Medium–High** for online ownership / taken-warning UX (15 live PASSes).  
**Medium overall** because auto-claim, conflict UI, open Peer Check, cross-account setup, and offline/reconnect were BLOCKED or SKIPPED — not failed.

## Audit Summary

**Overall result:** Pass with gaps

**Summary:**  
Exercised online ownership and taken-warning behavior passed. No new product failure was confirmed. Remaining incomplete paths are tracked through existing product issues (#269 / #270 / #271 / #442 / #476 / #533) plus new QA/infra issue [#574](https://github.com/eten-tech-foundation/fluent-mobile/issues/574).

**Follow-up required:**

- [x] All identified gaps have corresponding GitHub issues.
- [x] Mobile and API dependencies are cross-linked (none new for API from this audit).
- [x] Launch-blocking gaps are clearly identified (none; #574 is Medium / non-blocker).
- [ ] Assessment has been reviewed and merged.

**Merged assessment:** _(pending PR merge)_
