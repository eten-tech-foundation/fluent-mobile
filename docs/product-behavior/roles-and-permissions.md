# Roles and permissions

**Labels:** **API-doc contract** and **Inferred current behavior** from pinned API/web sources, plus **Open product decision** where mobile never stores grants. Not product agreement unless a ticket AC says so. Cross-check [maestro-role-coverage.md](../guides/maestro-role-coverage.md) (34 checklist rows; **0** verified live grant allow/deny).

## Two different systems

| Kind | What it is | Who sets it |
| --- | --- | --- |
| **Project / system grant** | Role row with permissions (`project:view`, `content:view`, `content:update`, `content:assign`, …) | Org/project admin on API |
| **Chapter relationship** | `assignedUserId` (drafter) and `peerCheckerId` (peer) on one chapter assignment | PM assign, claim, or open-peer submit |

A user can be Project Translator **and** drafter on chapter A **and** peer checker on chapter B. Grant ≠ slot.

## Project grants (API matrix)

**Source (API-doc contract @ 4336602):** [permissions.md](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/docs/permissions.md). Not an agreed product AC by itself.

| Grant | view | content:update | content:assign | Mobile note (inferred) |
| --- | --- | --- | --- | --- |
| SuperAdmin | yes | yes | yes | Web home routing; mobile unverified |
| Org Manager / Owner | yes | yes | yes | Web admin surfaces; mobile unverified |
| Org Member only | no | no | no | No content. Do not assume Account B = this grant |
| Project Manager | yes | yes | yes | Claim denied (`content:assign`). Edit at peer_check denied for managers |
| Project Translator | yes | yes | no | Slot rules apply for edit/submit/claim |
| Project Observer | yes | no | no | May GET resources (`project:view`); must not edit/claim |

**Inferred current behavior (mobile HEAD `758d4b0`):** app does not persist grants. Gate is signed-in vs not. Resources / Home Sync chrome is **not** grant-gated in client code (`HomeScreen` → `router.push(hrefs.sync)` with no grant check).

**Open product decision:** Should mobile hide Sync, Resources, or Record by grant, or always rely on server 403?

## Chapter slots and stages

**Source (API-doc contract — policy @ 4336602):** [chapter-assignments.policy.ts](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/src/domains/chapter-assignments/chapter-assignments.policy.ts).

Permissions **doc differs from policy**: the permissions doc is **stricter** (peer check described as requiring `peerCheckerId`). **Policy permits open peer** when `peerCheckerId` is null (non-drafter project member with `content:update`). Prefer policy for runtime allow/deny.

**Inferred stage chain (mobile):** [stageAdvancement.ts](../../src/utils/stageAdvancement.ts) — `not_started`/`draft` → `peer_check` → `community_review` → `linguist_check` → `theological_check` → `consultant_check` → `complete`.

| Stage | Who may edit / submit (API policy) | Local mobile slot UI (inferred) |
| --- | --- | --- |
| `not_started` / `draft` | Drafter (`content:update`) | No taken banner for drafter; Send to Peer Check when recordings exist |
| `peer_check` + assigned peer | That `peerCheckerId` only | Peer: no taken banner, Send to Community Review |
| `peer_check` + `peerCheckerId: null` | Non-drafter project member with `content:update` | Open peer: no taken banner for non-drafter; Send visible; drafter capture blocked |
| Post-peer (`community_review` …) | Project member (translator rules) | Send visible on last unit (helper does **not** check grant) |
| `complete` | — | Recording locked |

**Claim (translator, API policy):** unassigned `not_started` (and narrow race on `main`). PM cannot claim. Online **404** = deny; chapter must **not** become locally assigned — mock: [useVerseAudio.offlineClaim.test.ts](../../src/hooks/useVerseAudio.offlineClaim.test.ts). Open **#390** would widen conflict **200**s; not this API SHA / not deploy proof.

## Web vs mobile

**Inferred (web @ fb14699):** [RoleBasedHomePage](https://github.com/eten-tech-foundation/fluent-web/blob/fb146999c051fce552417356613a20831a46b773/src/components/RoleBasedHomePage.tsx) routes SuperAdmin → orgs, manager → projects, observer → observer dashboard, org-member-only → no assignments. Mobile has no equivalent grant router.

## QA snapshot (not Dev; not grant proof; not Nightly signoff)

Confirmed on **QA** (identity only):

- User id **10**, username **qa-t1**, independently matched QA seed translator email
- Projects **1, 8, 11**
- Assignment **484**, project **8**, **1 Peter 5**, status **`peer_check`**, drafter **11**, peer **10**, progress **0/14**

Assigned-peer slot — not PM / Observer / no-project-grant proof.

**Known observation (QA):** Resources empty copy on 484 = **valid empty UI fixture** (UI-only; no HTTP 403 conclusion). Tabs PASS 10.76s; Sync one-press failure **before** that tabs run — [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721). Details: [README QA evidence](./README.md#qa-device-evidence-assignment-484--chronology).

## Acceptance links (mock / unit only)

| Behavior | Link |
| --- | --- |
| Open peer / taken banner helpers (71 PASS) | [chapterTakenStatus.test.ts](../../src/utils/chapterTakenStatus.test.ts), [stageAdvancement.test.ts](../../src/utils/stageAdvancement.test.ts) |
| Sync 403 ≠ reauth / empty reconcile | [sync.auth.test.ts](../../src/services/sync.auth.test.ts) |
| Account switch target token only | [accountSession.test.ts](../../src/services/accountSession.test.ts) |
| Resource GET 403 ≠ empty chapter | [translationNotes.test.ts](../../src/services/translationNotes.test.ts), [translationQuestions.test.ts](../../src/services/translationQuestions.test.ts), [imagesMaps.test.ts](../../src/services/imagesMaps.test.ts), [prepareOfflineResources.test.ts](../../src/services/prepareOfflineResources.test.ts) |
| Claim 404 ≠ local assign | [useVerseAudio.offlineClaim.test.ts](../../src/hooks/useVerseAudio.offlineClaim.test.ts) |

Live grant allow/deny: still **0**. Unclaimed / open-peer pool: #607 / API #368 / #369.
