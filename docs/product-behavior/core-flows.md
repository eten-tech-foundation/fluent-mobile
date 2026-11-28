# Core flows (outline)

Living journeys on the Next app: **Home**, the **book** page, the **passage**
(Listen, Record, Resources, title sheet), and **Observer**. Each row:
**preconditions → expected → denied/empty/offline**. Expand one flow at a time;
do not treat this file as complete AC.

The assignment 484 receipt below is a historical Dev/QA run. It names the
Bible / Resources / Record tabs from that build. Those tabs are gone. Current
nightly steps are in [qa-process.md](../guides/qa-process.md#next-nightly-scenarios).

**Environment:** Dev receipts are historical. QA uses `qa.api` / `qa.app`. **Agent QA emulator debug ≠ human Nightly signoff.**

### QA receipt (assignment 484) — chronology

| Order | Result | Detail |
| --- | --- | --- |
| **1 (earlier)** | **Sync FAIL (single press)** | Exactly one Home Sync press did not reach `sync-screen` within 30s — [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721). Unresolved; **not** a role cause |
| **2 (later)** | **Tabs PASS** | Warm Bible / Resources / Record + back Home completed |
| **2** | **Valid empty Resources (UI only)** | `resources-tab` showed “No resources available for this verse” — empty UI fixture; **no HTTP 403 conclusion** from this run |
| — | **Do not claim** | 484 is not a populated or writable content fixture; populated Resources expansion **unverified** |

Full table: [README QA evidence](./README.md#qa-device-evidence-assignment-484--chronology).

---

## 1. Login / multi-account / session isolation

| | |
| --- | --- |
| **Preconditions** | Valid credentials for that API base; optional second stored account |
| **Expected** | Sign-in reaches Home; switch activates only target token/user; prior account data does not bleed |
| **Denied / empty** | Bad password stays on login; missing stored session for switch fails closed |
| **Offline** | A password verifier saved at the last online sign-in restores that device session with no network (#1001). The verifier is bound to that sign-in's token, so a later sign-in whose verifier save failed leaves offline sign-in unavailable rather than accepting the old password. No verifier, or a removed account, stays on “Unable to connect”. A 401 does not hide cached work. The session-expired banner shows only while Fluent is reachable and a sync is waiting or Sync was opened. |
| **Labels** | Inferred + mock: [accountSession.test.ts](../../src/services/accountSession.test.ts), [sync.auth.test.ts](../../src/services/sync.auth.test.ts). Maestro multi-account file ≠ pass |
| **Open** | What UI proves signed-in grant after login? |

## 2. My Work / milestones / claim

| | |
| --- | --- |
| **Preconditions** | Translator with assignments **or** claimable `not_started` unassigned chapter on a writable test project |
| **Expected** | Home **My work** lists assignee and peer work. Saving a take on an unassigned `not_started` chapter claims it (`useRecordSession` → `useVerseAudio`; online, or queued offline). A 404 does not assign locally |
| **Denied** | Already assigned (local or 404); PM claim; burned claim left `draft` after clear |
| **Empty** | No assignments → empty My Work (role unknown unless grant read) |
| **Labels** | API-doc/policy for claim. Known gap: PM PATCH cannot reset `not_started` (#368/#369). Pool: #607 |
| **QA note** | **484** is assigned peer (`peer_check`, peer=10), not a claim case |

## 3. Drafting / peer / community stages

| | |
| --- | --- |
| **Preconditions** | Open chapter; correct slot for stage |
| **Expected** | Passage title sheet shows Send only for the allowed actor. The label names the next stage (for example Send to Community Review). Open peer: a non-drafter can send; the drafter cannot |
| **Denied** | Drafter on open peer: no Send, capture blocked; non-assignee on PM-assigned peer: taken banner |
| **Labels** | Inferred helpers + API policy (open peer). Mock: [stageAdvancement.test.ts](../../src/utils/stageAdvancement.test.ts), [chapterTakenStatus.test.ts](../../src/utils/chapterTakenStatus.test.ts). Stage map: [stageAdvancement.ts](../../src/utils/stageAdvancement.ts) |
| **Open** | Should post-peer “any translator” require membership check in UI? |

## 4. Recording / takes / selected take / upload

| | |
| --- | --- |
| **Preconditions** | Mic granted; not complete-locked; not drafter-blocked on open peer |
| **Expected** | Passage **Record** → stop → play → delete. The **Official** toggle selects the take that uploads (`isSelected` / `selectedTake` still name that take in data). Upload via Sync / worker |
| **Denied / empty** | Complete lock; mic denied; unuploadable takes disable advance |
| **Offline** | Offline claim enqueue; reconnect upload/claim ([recordings-sync-contract.md](../guides/recordings-sync-contract.md)) |
| **Labels** | Inferred. Upload wire: `PUT /verse-audio/...` (API-doc/mobile contract). Claim 404: [useVerseAudio.offlineClaim.test.ts](../../src/hooks/useVerseAudio.offlineClaim.test.ts) |

## 5. Resources

| | |
| --- | --- |
| **Preconditions** | Project id present; online **or** inventoried offline downloads |
| **Expected** | Passage **Resources** card (images and maps), script notes (Understanding), and title-sheet **Translation Questions** when content exists |
| **Empty** | Offline no inventory → Prepare Offline copy; online empty → “no resources for this verse” (**QA 484 = valid empty UI**; no 403 conclusion) |
| **Denied** | Server 403 must not look like empty chapter — mock only: [translationNotes.test.ts](../../src/services/translationNotes.test.ts), [translationQuestions.test.ts](../../src/services/translationQuestions.test.ts), [imagesMaps.test.ts](../../src/services/imagesMaps.test.ts), [prepareOfflineResources.test.ts](../../src/services/prepareOfflineResources.test.ts) |
| **Labels** | Inferred UI. Tabs PASS with empty Resources UI; populated expansion **unverified** |
| **Open** | Which QA chapter has populated Resources for section-expansion AC? |

## 6. Upload / sync / offline / conflicts

| | |
| --- | --- |
| **Preconditions** | Pending takes and/or claims; connectivity |
| **Expected** | Home sync status → Sync screen; Sync Now uploads; audio `hasConflict` ≠ claim `hasClaimConflict` |
| **Denied** | 401 sets reauth; the background metadata refresh then skips the network until an online sign-in (manual Sync and uploads still try, and report the 401). It does not wipe cached grants. 403 projects → fail, not empty success ([sync.auth.test.ts](../../src/services/sync.auth.test.ts)) |
| **Offline** | Queue uploads/claims; reconnect |
| **Known deviation (QA)** | [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) — Sync one-press failed to open Sync screen (**before** tabs 484 PASS). Bug, not role cause. Agent debug ≠ Nightly signoff |
| **Labels** | Inferred. #391 audio; #390 open PR ≠ pinned `main`. Dev Account B Sync FAIL is historical Dev only |

## 7. Downloads / storage / settings

| | |
| --- | --- |
| **Preconditions** | Signed-in; Prepare Offline entry |
| **Expected** | Download packages; storage management; settings persistence |
| **Empty / offline** | Inventory gates Resources offline |
| **Labels** | Inferred |
| **Open** | Per-account vs device-global settings? |

---

## Open questions for product / others

1. Mobile grant visibility: hide chrome vs fail on API only?
2. Official QA accounts for PM, Observer, no-project-grant (same `qa.api`, grant read-back).
3. When open-peer / unclaimed pools land (#368/#369/#607), what are the QA acceptance journeys?
4. [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) vs #717 smoke — stop-ship or separate track?
5. Web admin roles: any mobile surface later, or forever web-only?

## What this outline is not

- Not Maestro PASS/FAIL for #717 as a whole
- Not a substitute for the Maestro role coverage checklist ([maestro.md](../guides/maestro.md))
- Not inventing AC for #390 before merge
- Not Nightly human QA signoff
