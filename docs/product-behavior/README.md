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

Reverified 2026-10-19 via GitHub `main` refs (mattrace-gloo): **API and Web SHAs unchanged.**

| Tree | SHA | Role |
| --- | --- | --- |
| Mobile HEAD | `758d4b04a9ca81e1ed6228e9d30df1fc80014f5d` | Baseline commit; working tree may add #717 Maestro/warm-entry work |
| fluent-api `main` | `4336602df77ce86a4d46dfd45a7840cc3c64ebc0` | [permissions](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/docs/permissions.md), [chapter-assignment policy](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/src/domains/chapter-assignments/chapter-assignments.policy.ts) |
| fluent-web `main` | `fb146999c051fce552417356613a20831a46b773` | [RoleBasedHomePage](https://github.com/eten-tech-foundation/fluent-web/blob/fb146999c051fce552417356613a20831a46b773/src/components/RoleBasedHomePage.tsx), [grant-utils](https://github.com/eten-tech-foundation/fluent-web/blob/fb146999c051fce552417356613a20831a46b773/src/lib/grant-utils.ts) |

Pinned `main` is **not** proof of deployed Dev or QA. [fluent-api#390](https://github.com/eten-tech-foundation/fluent-api/pull/390) is open; it is not this API SHA.

## Environments

| Env | API | Web |
| --- | --- | --- |
| Dev | `https://dev.api.fluent.bible` | Dev web (separate from QA) |
| QA | `https://qa.api.fluent.bible` | `https://qa.app.fluent.bible` |

User ids, emails, and roles **do not transfer** across environments. Seed / Maestro labels are not grant proof. Historical Dev emulator receipts are not QA acceptance. **Agent QA debug on the emulator is not human Nightly signoff.** See also [maestro-role-coverage.md](../guides/maestro-role-coverage.md) (owned elsewhere; do not rewrite here).

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

- Role test matrix / mock receipts: [maestro-role-coverage.md](../guides/maestro-role-coverage.md)
- Dated feature audits: [assessments/](../assessments/) (historical; superseded notices on each README)
- Claim fixtures gap ticket: [maestro-ownership-claim-fixtures](../assessments/chapter-assignment-and-claiming/tickets/maestro-ownership-claim-fixtures.md)
- Recordings sync wire: [recordings-sync-contract.md](../guides/recordings-sync-contract.md)
- Maestro process: [maestro.md](../guides/maestro.md)

## Tickets (existing only)

| ID | Note |
| --- | --- |
| Mobile [#717](https://github.com/eten-tech-foundation/fluent-mobile/issues/717) | Maestro / warm-entry coverage on this branch |
| Mobile [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) | QA: Home Sync press completes but Sync screen does not open (open; author mattrace-gloo) |
| Mobile [#607](https://github.com/eten-tech-foundation/fluent-mobile/issues/607) | Unclaimed / open-peer fixtures tracking |
| fluent-api [#368](https://github.com/eten-tech-foundation/fluent-api/issues/368) | Draft seed engine; QA unclaimed pool gap |
| fluent-api [#369](https://github.com/eten-tech-foundation/fluent-api/issues/369) | Confirm-gated reset |
| fluent-api [#390](https://github.com/eten-tech-foundation/fluent-api/pull/390) | Open claim-conflict handling (not this API SHA) |
| fluent-api [#391](https://github.com/eten-tech-foundation/fluent-api/issues/391) | Audio range conflicts |

## Mock unit receipts (not live grant proof)

| Area | Receipt |
| --- | --- |
| Slot helpers | 71 PASS / 2 suites — [chapterTakenStatus.test.ts](../../src/utils/chapterTakenStatus.test.ts), [stageAdvancement.test.ts](../../src/utils/stageAdvancement.test.ts) |
| Auth / session | 53 PASS / 2 suites — [sync.auth.test.ts](../../src/services/sync.auth.test.ts), [accountSession.test.ts](../../src/services/accountSession.test.ts) |
| Resource 403 transport | 69 PASS / 4 suites — [translationNotes.test.ts](../../src/services/translationNotes.test.ts), [translationQuestions.test.ts](../../src/services/translationQuestions.test.ts), [imagesMaps.test.ts](../../src/services/imagesMaps.test.ts), [prepareOfflineResources.test.ts](../../src/services/prepareOfflineResources.test.ts) |
| Online claim 404 | 11 PASS / 1 suite — [useVerseAudio.offlineClaim.test.ts](../../src/hooks/useVerseAudio.offlineClaim.test.ts) |

## QA device evidence (assignment 484) — chronology

**Order matters.** On QA (user id 10 / username `qa-t1`, independently matched seed translator email; projects 1/8/11; assignment **484** project 8 · 1 Peter 5 · `peer_check` · drafter 11 · peer 10 · 0/14):

1. **Earlier:** Home Sync — exact **one** press did **not** reach `sync-screen` within 30s. Filed [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721). Cause unresolved; **not** a role/permission conclusion. Chronology: this Sync attempt preceded the direct tabs run.
2. **Later:** Direct warm tabs on already-open **484** — **COMPLETED** 10.76s (Bible / Resources / Record + back Home). Artifacts: `test_output/qa-warm-tabs-open-2026-10-19_164004/2026-10-19_164005/tabs-already-open-484/`.

| Observation | Classification |
| --- | --- |
| Tabs journey PASS | Agent QA debug receipt — **not** Nightly human signoff; not grant proof |
| Resources UI: “No resources available for this verse” | **Valid empty UI fixture** for this verse. Observes **UI only** — **no HTTP 403 conclusion** from this run |
| Populated section expansion | **Unverified** |
| Sync one-press → no Sync screen | **Known deviation** [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) — not a role cause |
| 484 as populated / disposable content fixture | **Do not claim** |

Dev historical receipts remain non-QA. Live grant allow/deny remains **0**.
