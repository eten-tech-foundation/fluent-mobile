# Product behavior (living)

How Fluent Mobile **should** work for people using it. Not an assessment matrix, not Maestro runbooks, and not a claim that current code is the product contract.

**Labels (use on every section):**

| Label | Meaning |
| --- | --- |
| **Agreed requirement** | Explicit product/ticket AC agreed by humans. Cite the ticket or product note. **Not** “the API docs said so.” |
| **API-doc contract** | What pinned fluent-api / fluent-web docs or policy sources describe. Engineering reference only — does **not** imply product/user agreement. |
| **Inferred current behavior** | What pinned mobile / API / web **code** does today. May be wrong for product. |
| **Known deviation** | Observed mismatch (QA, Dev history, or code vs an explicit requirement). |
| **Open product decision** | Unsettled; do not invent agreement. |

Current mobile code is **never** automatically normative. API docs are never automatically product AC. Historical [assessments](../assessments/) keep dated findings; living guidance lives here.

## Pins (evidence, not deploy proof)

Verified 2026-10-19 against GitHub `main` refs (earlier than the 2026-10-23 [docs inventory](../documentation-hygiene.md); not re-checked then).

| Tree | SHA | Role |
| --- | --- | --- |
| Mobile | `758d4b04a9ca81e1ed6228e9d30df1fc80014f5d` | Baseline commit for the inferred-behavior notes below |
| fluent-api `main` | `4336602df77ce86a4d46dfd45a7840cc3c64ebc0` | [permissions](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/docs/permissions.md), [chapter-assignment policy](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/src/domains/chapter-assignments/chapter-assignments.policy.ts) |
| fluent-web `main` | `fb146999c051fce552417356613a20831a46b773` | [RoleBasedHomePage](https://github.com/eten-tech-foundation/fluent-web/blob/fb146999c051fce552417356613a20831a46b773/src/components/RoleBasedHomePage.tsx), [grant-utils](https://github.com/eten-tech-foundation/fluent-web/blob/fb146999c051fce552417356613a20831a46b773/src/lib/grant-utils.ts) |

Pinned `main` is **not** proof of deployed Dev or QA. [fluent-api#390](https://github.com/eten-tech-foundation/fluent-api/pull/390) was open at pin time; it is not this API SHA.

## Environments

| Env | API | Web |
| --- | --- | --- |
| Dev | `https://dev.api.fluent.bible` | Dev web (separate from QA) |
| QA | `https://qa.api.fluent.bible` | `https://qa.app.fluent.bible` |

User ids, emails, and roles **do not transfer** across environments. Seed / Maestro labels are not grant proof. Historical Dev emulator receipts are not QA acceptance. **Agent QA debug on the emulator is not human Nightly signoff.** Maestro process: [maestro.md](../guides/maestro.md).

## Index

| Doc | Status |
| --- | --- |
| [Roles and permissions](./roles-and-permissions.md) | Foundation — project grants vs chapter slots |
| [Core flows](./core-flows.md) | Foundation — journeys + QA chronology |
| Login / multi-account / session | Outline in core-flows |
| My Work / milestones / claim | Outline in core-flows |
| Drafting / peer / community stages | Outline in core-flows |
| Recording / takes / selected take | Outline in core-flows |
| Resources | Outline in core-flows; QA empty UI fixture |
| Upload / sync / offline / conflicts | Outline in core-flows; [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) |
| Downloads / storage / settings | Outline in core-flows |

## Related (do not duplicate)

- Maestro process and role flows: [maestro.md](../guides/maestro.md)
- Dated feature audits: [assessments/](../assessments/) (historical; see [assessments/README.md](../assessments/README.md))
- Claim fixtures gap ticket: [maestro-ownership-claim-fixtures](../assessments/chapter-assignment-and-claiming/tickets/maestro-ownership-claim-fixtures.md)
- Recordings sync wire: [recordings-sync-contract.md](../guides/recordings-sync-contract.md)

## Tickets (existing only)

| ID | Note |
| --- | --- |
| Mobile [#717](https://github.com/eten-tech-foundation/fluent-mobile/issues/717) | Maestro / warm-entry coverage |
| Mobile [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) | QA: Home Sync press completes but Sync screen does not open |
| Mobile [#607](https://github.com/eten-tech-foundation/fluent-mobile/issues/607) | Unclaimed / open-peer fixtures tracking |
| fluent-api [#368](https://github.com/eten-tech-foundation/fluent-api/issues/368) | Draft seed engine; QA unclaimed pool gap |
| fluent-api [#369](https://github.com/eten-tech-foundation/fluent-api/issues/369) | Confirm-gated reset |
| fluent-api [#390](https://github.com/eten-tech-foundation/fluent-api/pull/390) | Claim-conflict handling (not this API SHA) |
| fluent-api [#391](https://github.com/eten-tech-foundation/fluent-api/issues/391) | Audio range conflicts |

## Mock unit coverage (not live grant proof)

| Area | Tests |
| --- | --- |
| Slot helpers | [chapterTakenStatus.test.ts](../../src/utils/chapterTakenStatus.test.ts), [stageAdvancement.test.ts](../../src/utils/stageAdvancement.test.ts) |
| Auth / session | [sync.auth.test.ts](../../src/services/sync.auth.test.ts), [accountSession.test.ts](../../src/services/accountSession.test.ts) |
| Resource 403 transport | [translationNotes.test.ts](../../src/services/translationNotes.test.ts), [translationQuestions.test.ts](../../src/services/translationQuestions.test.ts), [imagesMaps.test.ts](../../src/services/imagesMaps.test.ts), [prepareOfflineResources.test.ts](../../src/services/prepareOfflineResources.test.ts) |
| Online claim 404 | [useVerseAudio.offlineClaim.test.ts](../../src/hooks/useVerseAudio.offlineClaim.test.ts) |

## QA device evidence (assignment 484) — chronology

Dated 2026-10-19. **Order matters.** On QA, signed in as a seed translator (user id 10; projects 1/8/11), assignment **484** (project 8 · 1 Peter 5 · `peer_check` · drafter 11 · peer 10 · 0/14):

1. **Earlier:** Home Sync — exactly **one** press did **not** reach `sync-screen` within 30s. Filed [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721). Cause unresolved; **not** a role/permission conclusion.
2. **Later:** Direct warm tabs on already-open **484** — completed (Bible / Resources / Record + back Home).

| Observation | Classification |
| --- | --- |
| Tabs journey PASS | Agent QA debug receipt — **not** Nightly human signoff; not grant proof |
| Resources UI: “No resources available for this verse” | **Valid empty UI fixture** for this verse. Observes **UI only** — **no HTTP 403 conclusion** from this run |
| Populated section expansion | **Unverified** |
| Sync one-press → no Sync screen | **Known deviation** [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) — not a role cause |
| 484 as populated / writable content fixture | **Do not claim** |

Dev historical receipts remain non-QA. Live grant allow/deny verified on device: **0**.
