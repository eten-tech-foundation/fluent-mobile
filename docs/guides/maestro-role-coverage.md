# Maestro role coverage

Checklist for project grants versus chapter slots. This is not a claim that every role is tested on a device or against a deployed server.

Pinned sources (GitHub `main` SHAs — source contract only, **not** a deploy receipt):

- fluent-api `4336602df77ce86a4d46dfd45a7840cc3c64ebc0` (2026-10-19T19:03:39Z) — [permissions](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/docs/permissions.md), [translation-resources routes](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/src/domains/translation-resources/translation-resources.route.ts), [chapter-assignment policy](https://github.com/eten-tech-foundation/fluent-api/blob/4336602df77ce86a4d46dfd45a7840cc3c64ebc0/src/domains/chapter-assignments/chapter-assignments.policy.ts)
- fluent-web `fb146999c051fce552417356613a20831a46b773` (2026-10-19T19:03:50Z) — [RoleBasedHomePage](https://github.com/eten-tech-foundation/fluent-web/blob/fb146999c051fce552417356613a20831a46b773/src/components/RoleBasedHomePage.tsx), [grant-utils](https://github.com/eten-tech-foundation/fluent-web/blob/fb146999c051fce552417356613a20831a46b773/src/lib/grant-utils.ts)

**Re-verified remote (2026-10-19):** both SHAs still equal each repo’s current `main` tip via `gh api …/commits/<sha>` and `…/commits/main`. That confirms the pin objects are unchanged on GitHub; it still does **not** prove what Dev or QA servers run.

[fluent-api#390](https://github.com/eten-tech-foundation/fluent-api/pull/390) may still be open relative to older bases — treat PR heads separately from the pin above. `main` already stores `hasClaimConflict` and `claimConflictUserId`. Neither SHA proves what QA is running.

Mobile does not store project grants (`src/db/schema.ts` has no role column). The app gate is signed-in versus signed-out (`src/navigation/authGate.ts`). Env account labels are not the warm session.

## Environment

**Dev receipts are not QA acceptance.** Historical emulator runs 241 and 258 (and other Dev smoke/targeted receipts in this checklist) used **Dev** `https://dev.api.fluent.bible`. Do not treat them as Nightly or QA-backend pass.

QA is a different pair: website `https://qa.app.fluent.bible` with API `https://qa.api.fluent.bible` ([qa-preview-testing.md](qa-preview-testing.md), `eas.json` `preview` / `nightly`). Hosted Maestro `e2e-test` profile bakes **Dev** — see [maestro.md](maestro.md).

### Live QA session notes (agent emulator debug — not Nightly human QA)

Recorded for handoff only; **do not** claim `@Roslin22` Nightly QA passed:

| Fact | Value | Proof level |
| --- | --- | --- |
| Signed-in QA user | user id **10**, seed shape **qa-t1** (translator) | Agent emulator session; parent owns re-login |
| Assigned peer chapter | peerCheckerId **484**, drafterId **11** | Live assignment read on QA; grant matrix still incomplete |
| Tabs navigation | PASS **10.76s** | Agent Debug+Metro / Maestro receipt — not Nightly APK |
| Resources empty chrome | Valid empty fixture | Observed on assignment **484** (UI only); not a grant proof; **no HTTP 403 conclusion** |
| Resources populated expansion | **BLOCKED** | No authorized QA populated fixture (see below). Not Dev Mark 1. |
| Home Sync single press | FAIL — opens [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) (author `mattrace-gloo`) | QA Android bug; not waived; lead owns Sync |

Pinned API `main` `4336602` and web `main` `fb14699` define expected behavior only. User ids, emails, and roles do **not** transfer across Dev/QA. Full QA grant cross-check (PM, observer, no-project-grant, all combinations) remains incomplete.

## Coverage count

Each row is one checklist line below. `chapterTakenStatus.test.ts` and `stageAdvancement.test.ts` are slot UI only. They do not prove a project grant, an allow or deny from the server, or who was signed in.

Rows 1–30 are the base checklist. Rows 31–34 record the resource-transport 403 cases that were not in that base. All of them are mocked mobile proof. Verified live grant allow or deny stays **0**.

| Proof level | Rows | Status |
| --- | ---: | --- |
| API or web source pin only | 13 | Rows 1–10 and 19–21. Not executed. `main` is not a deploy receipt. |
| Mobile unit, chapter slot, not a grant | 8 | Rows 11–18. `chapterTakenStatus.test.ts` and `stageAdvancement.test.ts`: 71 PASS, 2 suites. Not live auth. |
| Mobile unit, chrome or session, not a grant | 5 | Rows 22, 23, 26, 27, 28. Not a role. |
| Mobile unit, resource transport 403, not a grant | 4 | Rows 31–34. 69 PASS across 4 suites. A mocked 403 is not a known grant. |
| Static file or helper note, not executed | 2 | Row 29 is the Maestro flow file only. Row 30 is the warm-helper observation. |
| Device report, project role not read | 2 | Row 25: translator run 241, three PASS. Row 24: Account B run 258, empty and Resources PASS, Sync FAIL. |
| Grant allow or deny with a known identity | 0 | PM, observer, no-project-grant, and assigned peer remain unverified. |
| **Total** | **34** | Base 30 plus 4 transport rows. Full role coverage is not met. |

## Project and system grants

Allowed and denied below are the API permissions table. That is source pin, not a test result. Mobile never reads `grants`.

| # | Grant | view | content:update | content:assign | Level | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | SuperAdmin | allowed | allowed | allowed | web source | Unverified. No Fluent Web session was open to read a grant. Web home navigates to `/organizations` in source only. |
| 2 | Org Manager / Org Owner | allowed | allowed | allowed | web source | Not run on mobile. |
| 3 | Org Member only | denied | denied | denied | API source | Unverified. Do not treat Account B as this grant. |
| 4 | Project Manager | allowed | allowed | allowed | API source | Unavailable / unverified on device. |
| 5 | Project Translator | allowed | allowed | denied | API source | Run 241 reported three PASS. The grant on that session was not read back. |
| 6 | Project Observer | allowed | denied | denied | API source | Unavailable / unverified. `content:view` would allow resource GET; `content:update` would deny edit. Not tested. |

Combinations, all source-only and unverified (rows 7–10): Org Member + Project Translator, Org Member + Project Observer, Org Member + Project Manager, two project grants on one user. Web picks one effective role in `RoleBasedHomePage`. Mobile does not.

## Chapter slots

These are assignment fields, not grants. `peerCheckerId: null` is the API open slot. `undefined` is only the omitted local value; both fail `typeof === 'number'`, so the branch matches, and the null cases are the ones that match the wire.

Rows 11–18 are local slot UI. Level is mobile unit. They pass user ids into helpers. They do not prove Project Translator, Project Manager, Observer, or a server response.

| # | Actor on the chapter | Stage | Local allow | Local deny | Status |
| --- | --- | --- | --- | --- | --- |
| 11 | Drafter (`assignedUserId`) | `not_started` / `draft` | no taken banner; Send to Peer Check when a recording exists and this is the last unit | others' Send | Unit only |
| 12 | Non-assignee | `draft` | — | taken banner; Send hidden | Unit only |
| 13 | Assigned peer (`peerCheckerId` number) | `peer_check` | no taken banner; Send to Community Review without a new recording | other non-assignees see taken and no Send | Unit only. Live QA fixture noted: peer **484** / drafter **11** (identity only — grant UI not fully exercised) |
| 14 | Non-drafter | `peer_check`, `peerCheckerId: null` | no taken banner; Send visible; capture allowed; advance stores that user as peer checker | — | Unit only. Not a signed-in server call |
| 15 | Drafter | `peer_check`, `peerCheckerId: null` | no taken banner | Send hidden; capture blocked; advance does not set peer checker | Unit only |
| 16 | Missing drafter id | `peer_check`, `peerCheckerId: null` | — | Send hidden | Unit only. API also denies edit when `assignedUserId` is null; that deny is not this unit test |
| 17 | Any user id the helper is given | `community_review` through `consultant_check` | Send on the last unit | hidden off the last unit; disabled on conflict or unuploadable takes | Unit only. The helper does not check a grant |
| 18 | Any | `complete` | — | no further Send; recording lock in the helper | Unit only |

Server denials, source pin only (rows 19–21), not run in mobile tests: Project Manager edit at `peer_check` denied; Observer `content:update` denied; claim denied for `content:assign`. The permissions doc still says peer check requires `peerCheckerId`. The policy file allows null. Follow the policy file. [PR 390](https://github.com/eten-tech-foundation/fluent-api/pull/390) is not these rows.

## Surfaces that are not role-gated on mobile

| # | Surface | Level | Status |
| --- | --- | --- | --- |
| 22 | Resources tab chrome and empty copy | Mobile unit (`DraftingTabBar.test.tsx`, `resourcesSectionInventory.test.ts`, `ResourcesTab.test.tsx`) | Not a grant. Empty UI is content or `projectId`, not PM vs translator vs observer |
| 23 | Home header sync control | Mobile unit | `HomeScreen.test.tsx` real header, empty and populated: 3 PASS. Not a grant. Does not explain run 258 Sync FAIL. |
| 24 | Account B run 258 | Device report | Empty state PASS and Resources PASS. Sync FAIL. Project role not read. Not observer, PM, or non-member proof |
| 25 | Translator run 241 | Device report | Three PASS. Grant not read. Not proof of the other grants |

## Account switch, session, cache

| # | Check | Level | Status |
| --- | --- | --- | --- |
| 26 | Switch writes the other account's token and active user | `src/services/accountSession.test.ts` | In the 53 PASS / 2 suites / 9.565s auth-and-session run. Target id and token only. Not a live grant. |
| 27 | Switch resets navigation to home | `src/navigation/resetNavigationAfterAccountSwitch.test.ts` | Unit. Not Resources or Sync after the switch |
| 28 | Sync skips refresh when `userId` is not active; 401 sets reauth; 403 stays forbidden | `src/services/sync.auth.test.ts` | Same 53 PASS run. `getUserProjects` 403 does not set reauth and does not reconcile an empty project list. Not a live grant. |
| 29 | Maestro multi-account file | `.maestro/flows/accounts/multi-account-isolation.yaml` | File only, not a pass. Not Resources, not Sync-by-role |
| 30 | Warm session can skip login | `ensure-warm-home` | Env labels are not the signed-in user |

Offline claim tests in `src/hooks/useVerseAudio.offlineClaim.test.ts` use user id and assignment id. They are not an extra grant row. Server enforcement of `project:view` and `content:update` is rows 19–21 (source only).

## Resource transport mocks

Rows 31–34 are the 69 PASS / 4 suites resource run. Each 403 rejects. None of them names a grant. Multi-verse partial success and the source-audio fallback stay existing limitations inside those files; they are not extra role rows.

| # | Case | File | Status |
| --- | --- | --- | --- |
| 31 | Single-verse notes 403 rejects and is not an empty chapter | `src/services/translationNotes.test.ts` | Mocked unit PASS. Not a live grant. |
| 32 | Single-verse questions 403 rejects | `src/services/translationQuestions.test.ts` | Mocked unit PASS. Not a live grant. |
| 33 | Single-verse images 403 rejects | `src/services/imagesMaps.test.ts` | Mocked unit PASS. Not a live grant. |
| 34 | Translation-resources manifest 403 rejects and is not an empty catalog | `src/services/prepareOfflineResources.test.ts` | Mocked unit PASS. Not a live grant. |

Web-only, outside this count: Aquifer `/resources/...` in `useAquiferResources.ts` is a different API. That web tree has no Sync route. SuperAdmin and Org Manager stay unverified because no Fluent Web session was open to read a grant.

## Live account availability

**Dev (historical):** translator run 241 three PASS; Account B run 258 empty-state PASS, Resources PASS, Sync FAIL. Neither read a project role. Not QA identities.

**QA (agent emulator debug):** user **10** / username **qa-t1** / seed email `qa+fluentqa-translator@fluent.local`; projects **1 / 8 / 11**; assigned peer **484** (project 8 · 1PE 5 · `peer_check` · drafter **11** · peer **10**); tabs PASS 10.76s; empty Resources UI valid; Sync single-press FAIL [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721). **Not** human Nightly QA. No other retained accounts on this device dump.

Historical Jest counts (mock/component only, **not re-run** this pass): slot helpers **71** PASS; auth/session **53** PASS; resource 403 **69** PASS across 4 suites; claim 404 **11** PASS. Fan-out partial-success / all-fail already covered in `src/utils/loadResourcesForVerseRange.test.ts` (intentional partial merge) — **no new mock role/resource tests added** (would be fiction without mobile grants or a live QA content fixture).

### QA populated Resources fixture — blocked (2026-10-19)

| Question | Finding |
| --- | --- |
| Documented **QA** chapter with non-empty TN / TQ / Images for expansion AC? | **None** in authorized read evidence |
| Assignment **484** | Valid **empty** UI fixture only — not a populated candidate |
| Local QA dump (`/tmp/qa-fluent-now.sqlite`) | `download_queue` **0** rows; no offline resource inventory proving content |
| Other user-10 assignments present (GEN/MAT/1JN/1SA/ISA/PSA/EST, etc.) | Identity/assignment fields only — **not** content proof; do **not** pick a random first row |
| Maestro Dev disposable | `images-fullscreen` / `resources-sections` use **Dev** `MAESTRO_FIXTURE_MINE_LABEL` (Mark 1 on disposable ownership project per assessment) — **not** transferable to QA; `.env.maestro.qa` `MAESTRO_FIXTURE_*` ids/labels are **empty** |

**Exact data requirement to unblock populated expansion (device/lead or seed owner — not this pass):** on `https://qa.api.fluent.bible`, name one allowlisted assignment (or disposable QA fixture project + chapter label) where Resources shows at least one section toggle with non-empty body (Images preferred for `images-fullscreen` parity). Record assignment id, project id, book/chapter/verse, and which sections are populated. Until then: progress is **isolated mock contracts only** (rows 31–34 + fan-out util tests); live populated QA remains **BLOCKED**.

## Remaining blockers

Live grant coverage still needs named accounts on **one** API base with grants read back. Dev receipts stay Dev. QA acceptance stays on the **nightly APK** path ([qa-process.md](qa-process.md)), not agent Debug receipts. Do not copy Dev identities onto QA. Do not create accounts or change grants. Still needed:

- Project Manager on the fixture project
- Project Observer on that same project
- A user with no project grant
- Assigned peer: `peer_check` and `peerCheckerId` set to that user
- Open peer: `peer_check`, drafter set, `peerCheckerId` null, and the signed-in user is not the drafter
- **QA populated Resources chapter** (see blocked table above) — distinct from empty **484**

System-admin and org-manager grants stay web-only and unverified. No Fluent Web session was open, so an existing web grant could not be read. Env labels and runs 241 and 258 do not fill this list.

`src/hooks/useVerseAudio.offlineClaim.test.ts` now rejects an online `ApiError` 404 and checks the chapter is not treated as locally claimed (`onChapterClaimed` is not called, the offline claim writer is not called, and a later take still attempts the claim). That is mocked hook proof on the current `main` contract. It is not a live grant, and it does not encode open #390.

Still not a live pass: row 29 has not been executed as a Nightly human pass; row 30 (`ensure-warm-home` / `ensure-warm-session`) can login or Discard recovery — not a safe “preserve manual session” proof; Dev run 258 Sync FAIL remains separate from QA [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721). Assign-selected still cannot set chapter status.
