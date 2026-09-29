# Offline Chapter Assignment Audit

> **Status: device run done; gaps not yet filed.** Two gaps are confirmed on
> device (Gap 1 and Gap 2). Related sync problems found during the run are
> listed separately, and their destination is decided when gaps are filed.

## Overview

**Feature:** Offline chapter assignment — provisional claim on first recording
while offline, reconnect claim sync, claim-conflict detection and display, and
conflict clearing after PM resolution  
**Auditor:** Jonathan Seehagen (`@JonathanSeehagen`)  
**Date tested:** 2026-09-28 to 2026-09-29  
**Build/version:** Local debug dev client (Metro) of `main` @ `fb634e5`  
**Environment:** `https://dev.api.fluent.bible`  
**Device and OS:** Xiaomi Redmi Note 9 Pro, Android 10 (API 29), physical
device. A second Android device, signed in as the other translator, was used
for the two-device race (D) and the banner refresh check (G)  
**Audit sub-issue:** [#533](https://github.com/eten-tech-foundation/fluent-mobile/issues/533) (epic [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526))

## Scope

In scope: offline claim on first recording (#270), reconnect claim sync and
claim conflicts (#271), the conflict indicator and Record banner as they apply
to claim conflicts (#260, #269), and the claim-queue hardening (#470).

Out of scope, owned by sibling audits: online claim and ownership icons
([#532](https://github.com/eten-tech-foundation/fluent-mobile/issues/532)),
Prepare for Offline chapter selection
([#529](https://github.com/eten-tech-foundation/fluent-mobile/issues/529)),
audio upload and general reconnect sync
([#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530)),
and audio-take conflicts (#256).

## Related Issues

Product specs (source of expected behavior):

- [#267](https://github.com/eten-tech-foundation/fluent-mobile/issues/267) — Claim and assignment indicators on chapter rows (Closed)
- [#268](https://github.com/eten-tech-foundation/fluent-mobile/issues/268) — Online chapter claiming on first recording (Closed; passed QA)
- [#270](https://github.com/eten-tech-foundation/fluent-mobile/issues/270) — Offline chapter claiming on first recording (Closed; PR #351)
- [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) — Reconnect claim sync and conflict detection (Open; merged in PR #427, no QA comment yet)
- [#260](https://github.com/eten-tech-foundation/fluent-mobile/issues/260) — Conflict indicator on the chapter list (Closed; PR #362)
- [#269](https://github.com/eten-tech-foundation/fluent-mobile/issues/269) — Taken and conflict warnings on the Record tab (Open; taken half passed QA online and offline, conflict half untested)
- [#273](https://github.com/eten-tech-foundation/fluent-mobile/issues/273) — Refresh assignment and stage state when the chapter list opens (Closed)

Engineering / API:

- [fluent-api#272](https://github.com/eten-tech-foundation/fluent-api/issues/272) — Translator self-claim and multi-claimant conflict (Open; claim endpoint shipped in fluent-api PR #280)
- [#470](https://github.com/eten-tech-foundation/fluent-mobile/issues/470) — Claim queue hardening and metadata error visibility (Closed; PR #472)

Bug fixes and regressions:

- [#234](https://github.com/eten-tech-foundation/fluent-mobile/issues/234) — FK failure in chapter assignment sync (Closed)
- [#545](https://github.com/eten-tech-foundation/fluent-mobile/issues/545) — Sync Now can no-op while pending uploads remain (Closed)

Adjacent (owned by sibling audits or other tickets, listed for cross-reference):

- [#256](https://github.com/eten-tech-foundation/fluent-mobile/issues/256) — Conflict detection for offline audio takes (Open)
- [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) — Local stage advancement queue (Open)
- [#574](https://github.com/eten-tech-foundation/fluent-mobile/issues/574) — Maestro E2E and safe fixtures for ownership and online claim (Open; PR #582 open)
- [#599](https://github.com/eten-tech-foundation/fluent-mobile/issues/599) — Upload foreground-service crash on reconnect (Open; from the #530 audit)
- [#532](https://github.com/eten-tech-foundation/fluent-mobile/issues/532) — Chapter assignment and claiming audit (deferred offline claim and reconnect here)
- [#529](https://github.com/eten-tech-foundation/fluent-mobile/issues/529) / [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530) — Going offline / Returning online audits

## Expected Behavior

Consolidated from the specs above.

- **Offline claim:** the first recording on a chapter that is unassigned in
  the last-synced data claims it locally, with no prompt and no live server
  check (#270).
- **Provisional "mine":** the chapter row shows the "mine" state (`li:user`,
  primary blue) right away. The claim is provisional until synced (#270,
  #267).
- **Taken offline:** a chapter assigned to someone else in the last-synced
  data shows the taken warning on Record while offline, and recording is not
  blocked (#269). It is not claimed.
- **Reconnect:** pending offline claims are pushed as part of the standard
  sync cycle. A clean claim is confirmed silently, and the row stays "mine"
  (#271).
- **Conflict:** if another translator claimed, or was assigned, the same
  chapter during the offline window, the row shows the conflict state
  (`li:users` with a `li:triangle-alert` badge). Nothing is auto-resolved; the
  indicator persists across syncs and is visible to everyone with access to
  the chapter (#271, #260).
- **Resolution:** once a PM picks the assignee on web, the next sync clears
  the conflict silently and shows "mine" or "taken" (#271). #271 also says
  the PM conflict resolution mechanics are out of scope and will be specified
  separately.
- **Resilience:** pending claims survive app restarts. A single failed claim
  does not abort the metadata sync, and failures appear on the Sync page
  (#470).

## Code Review Notes (pre-device)

Read on fluent-mobile `main` @ `fb634e5` and fluent-api `main` @ `acc1404`.

- **Mock data:** none on the claim path. Claims use the real
  `POST /chapter-assignments/:id/claim` (`src/services/api.ts:124`), which is
  live on fluent-api `main` (PR #280). The only stub is the dev-only
  `EXPO_PUBLIC_DEV_PREVIEW_CHAPTER_CONFLICT` toggle
  (`src/config/devPreviewChapterConflict.ts`), gated by `__DEV__`, which
  forces the Record conflict banner for manual QA. It is not a data mock and
  not a gap.
- **Offline claim:** `useVerseAudio` runs after the take is persisted
  (`src/hooks/useVerseAudio.ts:486-527`). When the chapter's last-synced
  `assignedUserId` is null and the device is offline, `claimChapterOffline`
  (`src/db/repositories/chapterClaimsRepository.ts:35`) sets
  `assigned_user_id` locally and enqueues a `chapter_claim_queue` row in one
  transaction. It checks only the assignee, not the chapter status.
- **Reconnect push:** pending claims are pushed by
  `syncPendingChapterClaimsForUser` (`src/services/sync.ts:301`), which runs
  **only** inside `syncAllUsers` (Sync Now and the Home auto-repair sync) and
  `syncAllData` (login and reauth), in both cases after the master data and
  before the assignment pull. The chapter-list refresh
  (`refreshChapterMetadataIfOnline`, `src/services/sync.ts:1142`) and the
  upload orchestrator's automatic offline→online session
  (`src/services/uploadOrchestratorCore.ts:245`) do **not** push claims.
  Confirmed on device → **Gap 2**.
- **List refresh drops the provisional claim:** the list refresh calls
  `reconcileUserChapterWork` (`src/db/repository.ts:1341`), which sets
  `assigned_user_id` to null for chapters the server did not return for the
  user. It does not check `chapter_claim_queue`, so it clears an offline claim
  that has not been pushed yet. Found during C.2 → **Gap 2**.
- **Sync Now ordering:** Sync Now starts the full sync without awaiting it
  and then starts the upload session (`src/app/screens/SyncScreen.tsx:94-96`).
  The full sync downloads master data first (`syncMasterData`,
  `src/services/sync.ts:217`), so the upload runs before the claim is pushed.
  Found during C.3 → **Gap 2**.
- **Sync Now visibility:** the Sync page hides Sync Now in the `allComplete`
  and `uploadComplete` states (`src/components/ui/SyncActionControls.tsx:147-150`),
  even while claims are pending or the chapter-claims error is shown → **Gap 2**.
- **Claim outcomes:** `syncPendingChapterClaims`
  (`src/services/chapterClaimSync.ts:53`) resolves the queue row on a win,
  on `hasClaimConflict`, or when another finite assignee comes back (the last
  two set local `has_conflict = 1`). **Any thrown error leaves the row
  pending**, and the next sync retries it.
- **API claim policy (fluent-api):** `chapterAssignmentPolicy.claim`
  (`src/domains/chapter-assignments/chapter-assignments.policy.ts`) allows a
  claim on an unassigned `not_started` chapter. If another user already holds
  the chapter, the claim is allowed (and flagged as a conflict) only while the
  chapter is `draft`, **has no peer checker**, and was updated within
  `CLAIM_RACE_WINDOW_MS` (5 minutes). Otherwise the auth middleware returns
  **404** (`chapter-assignment-auth.middleware.ts:86`). The policy comment
  says: _"offline reconnect conflicts are detected client-side during
  assignment sync (#271), not via this branch."_ No mobile code compares
  pending `chapter_claim_queue` rows against the pulled assignee. Confirmed
  on device → **Gap 1**.
- **Upload before claim:** the API edit policy lets a translator upload audio
  only for a `draft` chapter they are assigned to. A `not_started` chapter
  rejects all translator uploads, and the rejection is returned as a 404
  ("Verse audio recording not found"). Confirmed on device → **Gap 2**.
- **Unassigned but not `not_started`:** if a PM unassigns a chapter that is
  already in `draft`, both the online and the offline claim hit the 404
  branch. Online, the error is only logged
  (`src/hooks/useVerseAudio.ts:520`) and nothing is queued. Offline, the
  queue row never resolves. Not confirmed: H.1 was blocked (see Gaps).
- **Online claim not retried:** if the online claim call throws (timeout,
  5xx), nothing is queued. The claim is retried only on the next recording
  in that chapter. Code-only; hard to trigger on a device.
- **Record conflict banner:** `useChapterConflictStatus`
  (`src/hooks/useChapterConflictStatus.ts`) reads `has_conflict` once per
  chapter id, so a conflict set while the drafting screen stays mounted might
  not appear until the screen remounts. Not reproduced: G passed on device.
- **Banner copy:** claim conflicts and audio-take conflicts share one
  `has_conflict` flag (`src/services/mapChapterAssignment.ts:24-35`), so a
  claim conflict shows the #269 audio-take copy "Unresolved audio take
  conflict on this chapter/pericope." on Record (seen in D.5). See Open
  Questions.
- **Row rendering:** `MyWorkRow` and `ProjectChapterRow` render
  `ChapterConflictIndicator` *instead of* the ownership icon when
  `hasConflict` is set, which matches #271's conflict state.
- **Local status after offline claim:** the server moves a claimed chapter
  to `draft`, but `claimChapterOffline` leaves the local status unchanged
  (`not_started`) until the next pull. Observed in B.7.
- **Conflict clearing:** fluent-api `updateChapterAssignment` sets
  `hasClaimConflict` to false on any PM reassignment, and mobile applies it on
  the next pull. This clears the flag, but it is a side effect of
  reassignment, not a resolution flow, and the losing translator's takes stay
  unuploadable.
- **Automated coverage:** strong unit coverage (`chapterClaimSync.test.ts`,
  `chapterClaimsRepository.test.ts`, `useVerseAudio.offlineClaim.test.ts`,
  `sync.steps.test.ts`). No Maestro flow covers offline claim or reconnect
  (`.maestro/flows/offline/` covers login and storage only), so the device
  script was fully manual.

## Test Results

Scenario numbers match the device test script used for this audit (section
letter + step). "Translator A" is the account on the test device that records
offline; "translator B" is the other translator account. Rows marked
Pass matched the expected result; Blocked and Skipped rows explain why.
E.2–E.4 are setup steps (PM assigns W to B, wait at least 6 minutes, A
reconnects and taps Sync Now), folded into E.5 and not counted.

### Coverage counts

| Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|
| 35 | 24 | 8 | 1 | 2 |

Failures and gaps do not map 1:1: three failures (C.1–C.3) are Gap 2, and
five (D.8, E.5–E.8) are Gap 1. Gap 2 also shows up inside passing scenarios:
D.3 and F-alt only passed after a manual Sync Now or a sign-out/sign-in.

| # | Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| A.1 | Online baseline: fresh unassigned chapters | Unassigned, Not Started, no ownership icon | As expected | Pass |
| B.1 | Airplane mode on | Header cloud gray (offline) | As expected | Pass |
| B.2 | Offline: open an unassigned chapter → Record | No taken warning; Record enabled | As expected | Pass |
| B.3 | Offline: record + stop the first take | Take saved; no claim prompt (#270) | As expected; claim enqueued in `chapter_claim_queue` | Pass |
| B.4 | Offline: back to View Project / My Work | Row shows "mine" (blue `li:user`) (#270) | As expected; the chapter also appears in My Work | Pass |
| B.5 | Offline: record a second take | No change; still "mine" | As expected | Pass |
| B.6 | Offline: kill and relaunch | Still "mine"; takes present | As expected | Pass |
| B.7 | Offline: stage label after the claim | Observation only | Stays "Not Started" until the claim is pushed (the server moves it to Draft) | Pass (observation; see Open Questions) |
| B.8 | Offline: record on a chapter taken by another translator | Taken warning; recording allowed; row stays "other" (#269) | As expected | Pass |
| C.1 | Reconnect (Wi-Fi on) without tapping Sync Now | Takes on the offline-claimed chapter upload without error (#271 "standard sync cycle") | The automatic upload runs before any claim push and gets 404 "Verse audio recording not found"; the take is marked failed. Reproduced on Acts 1 and Acts 3 | **Fail** → Gap 2 |
| C.2 | Relaunch online → Projects → the project (list refresh) | Row still "mine" | The list refresh cleared the local claim ("Reconciled stale assigned_user_id"); the row lost its blue icon while the claim was still pending (Acts 6) | **Fail** → Gap 2 |
| C.3 | Sync Page → Sync Now | Claim pushed; takes uploaded; no errors | The upload runs in parallel with the full sync and gets 404 about 1 s in; the claim is pushed about 30 s later, after the master data. The take uploads only in a later session (the next automatic session or a third Sync Now). After the failed upload, Sync Now stays disabled until the Sync page is reopened | **Fail** → Gap 2 |
| C.4 | Web: the claimed chapters | Assigned to translator A, status Draft | As expected (Acts 3, Acts 6) | Pass |
| D.1 | Offline: A records on chapter Y | Y "mine" (provisional) | As expected (Numbers 6) | Pass |
| D.2 | B records on Y **online** on a second device | B claims Y at once (no peer checker) | As expected; the server shows Y assigned to B, Draft | Pass |
| D.3 | A reconnects within 5 min of D.2 → Sync Now | Claim conflict detected; no auto-assign (#271) | The API returned `hasClaimConflict`; `has_conflict = 1` stored and the queue row resolved (the claim reached the server about 3 min 53 s after B's claim). Passed only because Sync Now was tapped inside the window: the automatic upload got 404 and the list refresh turned the row gray first (Gap 2) | Pass |
| D.4 | A: Projects → the project | Y shows the conflict indicator (#260) | As expected | Pass |
| D.5 | A: open Y → Record | Conflict banner (#269) | Amber banner "Unresolved audio take conflict on this chapter/pericope." (audio-take copy for a claim conflict; see Open Questions) | Pass |
| D.6 | A: Sync Now again | Conflict persists | As expected | Pass |
| D.7 | B's device: view Y | Conflict indicator visible to B too (#271) | As expected, on both devices | Pass |
| D.8 | PM assigns chapter Z to another translator on web (web also sets a peer checker); A, who recorded on Z offline, reconnects **within 5 min** → Sync Now | Conflict indicator (#271: "claimed **or was assigned**") | Claim `POST` got 404 ×3 at 1 min 41 s after the PM assignment; "Failed to sync 1 pending chapter claim(s)"; row gray ("other"); no conflict (Numbers 5) | **Fail** → Gap 1 |
| E.1 | Offline: A records on chapter W | W "mine" (provisional) | As expected (Titus 2) | Pass |
| E.5 | PM assigns W to B; wait ≥ 6 min; A reconnects → Sync Now; check the Sync page | No claim error | "Verse audio recording not found" and "Failed to sync 1 pending chapter claim(s)"; the sync still reports success | **Fail** → Gap 1 |
| E.6 | A: Projects → the project | W shows the conflict indicator (#271) | Row gray ("other"), Draft, pending-upload cloud; no conflict indicator or banner; W not in A's My Work | **Fail** → Gap 1 |
| E.7 | Sync Now again | No repeated claim error | Claim 404 ×3 again, the error is stored again, the queue row stays pending; A's take can never upload | **Fail** → Gap 1 |
| E.8 | A deletes the stuck take | The claim no longer blocks sync | Take deleted, but the claim row stays pending and fails on every full sync ("orphan" claim). Also on Numbers 5 | **Fail** → Gap 1 |
| F.1 | PM resolves the conflict on web | Conflict clears silently; "mine" (#271) | Not run: the PM resolution flow is not implemented yet (#271 leaves it out of scope) | Skipped |
| F.2 | PM resolves in favor of B | Conflict clears; row "other" | Not run (same reason) | Skipped |
| F-alt | Stuck claim (E): PM assigns W to A → full sync | Claim accepted; error clears | Claim accepted and error cleared, but only after sign-out/sign-in: Sync Now was hidden because no uploads were pending, and the app has no other way to run a full sync (Gap 2) | Pass |
| G.1 | Record tab open on a chapter; a sync sets a conflict; go back to Record | Banner appears without reopening the chapter | As expected on Numbers 8 (second attempt): the amber conflict indicator showed after the sync. The first attempt (Numbers 7) produced no conflict: its claim reached the server outside the 5-minute window and got 404 (Gap 1) | Pass |
| G.2 | Leave and reopen the chapter | Banner shown | As expected | Pass |
| H.1 | (Optional) PM unassigns a chapter already in Draft; A records on it offline, reconnects, Sync Now | Chapter claimed, or a clear message; no stuck claim | Web could not produce "Draft with no drafter": removing the assignment left another translator as drafter, so the app (correctly) showed "other" and did not claim | Blocked |
| I.1 | Online: first take on an unassigned chapter (#268 regression check) | Claimed at once | Claimed within 2 s (Ruth 2 as one account, Ruth 3 as the other) | Pass |
| I.2 | Row state after the online claim | "mine" at once | As expected | Pass |
| I.3 | Take upload after the online claim | Take uploads | Uploaded on Sync Now on a project with a unique book (Numbers 3). No automatic upload after an online take (matches #150's triggers). An earlier try failed because of the cross-project upload bug (Related findings) | Pass |

## Offline and Synchronization Results

| Scenario | Result | Notes |
|---|---|---|
| Feature used while offline | Pass | B.1–B.8 |
| App closed and reopened offline | Pass | B.6 |
| Device returns online | Fail | C.1–C.3: the automatic upload runs before the claim, and the list refresh clears the provisional claim (Gap 2) |
| Offline changes synchronize | Fail | Claims reach the server only through a full sync (Sync Now, login, Home auto-repair). With no pending uploads Sync Now is hidden, so sign-out/sign-in is the only way (Gap 2). Audio upload itself is #530 |
| Conflicting changes are handled | Fail | The conflict UI works (D.4–D.7) when a translator claims first, with no peer checker, and a full sync runs within 5 min. A PM assignment (D.8) or a longer offline window (E) gives 404, a stuck claim and no conflict (Gap 1). Resolution not implemented (F). Audio-take conflicts are #256 |

## Gaps Identified

Both confirmed gaps share one root: an offline claim is a local-only promise
that only the full sync pushes. The automatic upload, the chapter-list
refresh and the Sync page act without it, and the API and the app each expect
the other to detect reconnect conflicts. The sync problems listed under
Related findings make both gaps worse but do not cause them.

### Gap 1: Offline claim conflicts are not surfaced when a PM assigned the chapter or the offline window exceeds 5 minutes

**Severity:** High (the conflict #271 exists to surface is silently lost, and the offline translator's work is stranded)  
**Launch blocker:** To be decided with product  
**Related issue:** [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271), [#470](https://github.com/eten-tech-foundation/fluent-mobile/issues/470), [#260](https://github.com/eten-tech-foundation/fluent-mobile/issues/260), [#269](https://github.com/eten-tech-foundation/fluent-mobile/issues/269), [fluent-api#272](https://github.com/eten-tech-foundation/fluent-api/issues/272)  
**Development task:** ⏳

**Description:**  
The claim API flags a conflict only when the chapter is `draft`, has no peer
checker, and was updated in the last 5 minutes. Otherwise it returns 404
("Chapter assignment not found"), and its comment expects the client to
detect reconnect conflicts during the assignment pull. Mobile has no such
check and treats the 404 as a transient failure:

- the `chapter_claim_queue` row stays pending, and every full sync retries it
  3 times and stores "Failed to sync N pending chapter claim(s)", while the
  sync still reports success;
- the pull turns the row "other" (gray), with no conflict indicator or
  banner, and the chapter leaves the translator's My Work;
- the translator's takes can never upload, and deleting them does not clear
  the claim, which keeps failing on every sync. There is no UI to clear it.

Because the web assignment sets a peer checker, a PM assignment never
produces a conflict, even inside the 5-minute window (D.8). A longer offline
window, the usual case, never produces one either (E). The conflict works
only for a translator-versus-translator race pushed within 5 minutes (D.3).
The fix may need API input, for example returning a conflict instead of 404
for a reconnecting claimant.

**Steps to reproduce:**  
1. Translator A: airplane mode, record the first take on an unassigned Not
   Started chapter W. W shows "mine".
2. PM on web: assign W to translator B.
3. A: turn Wi-Fi on → Sync → Sync Now (inside or after 5 minutes).
4. Check the Sync page, the chapter row, and Record.

**Expected behavior:** per #271, the chapter shows the conflict state, is
not auto-resolved, and the pending claim stops retrying.  
**Actual behavior:** claim 404 on every sync, "Failed to sync 1 pending
chapter claim(s)", row gray with no conflict, take stuck; the claim survives
take deletion.  
**Evidence:** D.8, E.5–E.8. Recovery only by the PM assigning the chapter to
the claimant and a full sync (F-alt).

### Gap 2: Pending offline claims are not pushed before the upload and the list refresh on reconnect

**Severity:** High  
**Launch blocker:** To be decided with product  
**Related issue:** [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271), [#545](https://github.com/eten-tech-foundation/fluent-mobile/issues/545), [#273](https://github.com/eten-tech-foundation/fluent-mobile/issues/273), [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530)  
**Development task:** ⏳

**Description:**  
Only the full sync (Sync Now, login, reauth, Home auto-repair) pushes pending
claims. The other online paths act without them:

- **Automatic upload on reconnect or app open:** the server still sees the
  chapter as unassigned `not_started`, the edit policy rejects the upload, and
  the take is marked failed with a misleading 404 "Verse audio recording not
  found" (C.1).
- **Sync Now:** it starts the full sync without awaiting it and runs the
  upload in parallel. The full sync spends about 30 s on master data before
  the claims, so the upload loses the race every time and the take only
  uploads in a later session (C.3).
- **Chapter-list refresh (#273):** `reconcileUserChapterWork` clears the
  local assignee for chapters the server did not return, ignoring the claim
  queue, so the translator's own chapter turns unassigned or "other" until a
  full sync (C.2).
- **Sync page:** after a failed upload, Sync Now stays disabled until the
  page is reopened. When no uploads are pending, Sync Now is hidden even
  while claims are pending or the chapter-claims error is shown, so the only
  way to push a claim is to sign out and back in (F-alt).

In the conflict case, this delay also uses up the 5-minute window that
Gap 1 depends on (D.3 only passed because Sync Now was tapped in time).

**Steps to reproduce:**  
1. Offline: record on an unassigned chapter (it shows "mine").
2. Turn Wi-Fi on and wait, without tapping Sync Now: the upload fails.
3. Open Projects → the project: the row is no longer "mine".
4. Sync → Sync Now: the upload fails again, the claim is pushed about 30 s
   later, and the take uploads only on a later session.

**Expected behavior:** per #271, claims sync "as part of the standard sync
cycle" on reconnect. The row stays "mine", and takes upload without errors.  
**Actual behavior:** upload 404 before the claim, provisional "mine" cleared
by the list refresh, and no UI to push claims when no uploads are pending.  
**Evidence:** C.1–C.3 (Acts 1, 3, 6), D.3 (Numbers 6), F-alt (Titus 2).

### Not confirmed (code-only)

- **Unassigned chapter already in Draft** (`src/hooks/useVerseAudio.ts:520`):
  H.1 was blocked, so this stays a Code Review Note with no issue.
- **Record banner not refreshing while mounted**
  (`src/hooks/useChapterConflictStatus.ts`): G.1 and G.2 passed on device, so
  this stays a Code Review Note with no issue.

## Related findings outside this audit's scope

Found during the device run. They belong to upload and sync (#530) or other
features, and they make the gaps above worse. Their destination (new issue
or comment on an existing one) is decided when gaps are filed.

- **Critical — full master data on every Sync Now:** every full sync
  downloads all languages (7,629), books (85) and bibles (776) with no
  `updatedAfter` (`syncMasterData`, `src/services/sync.ts:217`) before user
  data and claims. This takes about 30 s on Wi-Fi, costs data, and delays
  every claim push (Gap 2, and Gap 1's window). Repeated taps are not
  debounced, overlapping full syncs start, and the API answers HTTP 429 "Too
  many requests" (20 times in one burst), ending in "Sync all users failed".
- **High — upload to the wrong project unit:** pending uploads resolve
  `project_unit_id` by bible + book + chapter with `ORDER BY ca.id LIMIT 1`
  (`src/db/repository.ts:993-1000`), because recordings are keyed by
  `bible_text_id` only. When two projects (or, with Milestones #333, two
  units) share the target bible and book, the upload goes to the wrong unit:
  a 404, or a silent upload to the wrong project if both are assigned
  (Ruth 3). PR #552 and a #333 comment note the display side as
  pre-existing; no issue covers the upload.
- **Upload orchestrator gets stuck:** after a 404 and a brief connectivity
  flicker, the orchestrator logs "Upload paused silently (server
  unreachable)" and Sync Now no longer starts an upload session until the app
  is relaunched; the Home header keeps a syncing icon. Seen three times,
  including on the second device. The same 404 is sometimes classified as
  failed and sometimes as "server unreachable".
- **Several upload sessions per trigger and a foreground-service crash on
  reconnect** (single chapter, Acts 6): same as #599.
- **No automatic upload for takes recorded online:** matches #150's
  triggers (reconnect and app open only); product question for #530.
- **Local delete does not remove server audio:** there is no delete call, and
  a take deleted during an in-flight upload still lands on the server.
- **New project chapters missing for an existing account:** three new
  projects showed 0 chapters for an account with an existing sync cursor but
  the right chapters for a fresh login. Cause not verified.
- **Upload progress count:** "Upload failed" with "0 of 0 chapters", same as
  #600.

## Open Questions

- #271 is open, but its behavior is on `main` (PR #427) and it has no QA
  comment. D.3–D.7 pass its conflict display criteria; D.8 and E fail its
  "or was assigned" case (Gap 1). Resolution (F) is not implemented.
- A claim conflict shows the audio-take banner copy ("Unresolved audio take
  conflict on this chapter/pericope.") on Record. Should claim conflicts use
  their own copy?
- After a conflict, the losing translator's takes belong to a chapter
  assigned to someone else, and the API edit policy rejects their uploads.
  What should happen to those takes? This overlaps #256 and #530.
- Should an offline claim also move the local stage to Draft (as the server
  does), or is "Not Started" + "mine" acceptable until sync (B.7)?
- Can the web assign a drafter without a peer checker? If not, the API's
  claim-conflict branch is reachable only through translator-versus-translator
  races (Gap 1).
- In production, can two projects share the same target bible and book? This
  sets the severity of the wrong-unit upload (Related findings).

## Audit Summary

**Overall result:** Pass with gaps

**Summary:**  
On a physical Android 10 device, the offline part works: the first offline
take claims the chapter with no prompt, the row shows "mine" and survives a
relaunch, and a chapter taken by someone else shows the taken warning. The
conflict UI also works when it is reached: after a translator-versus-translator
race pushed within 5 minutes, the conflict indicator shows on both devices,
the Record banner appears (also without reopening the chapter), and the
conflict persists across syncs. The online claim (#268) still works.

The main risk is **sync on reconnect**. The offline claim is pushed only by
the full sync, so the automatic upload fails before it, the list refresh
clears the provisional "mine", and with no pending uploads there is no way
to push a claim except signing out (Gap 2). When the chapter was taken during
the offline window, the conflict is lost unless another translator claimed it
with no peer checker and the push happens within 5 minutes; a PM assignment
or a longer offline window leaves a claim that fails on every sync and takes
that can never upload (Gap 1). Slow full syncs (all master data on every
Sync Now), a stuck upload orchestrator and duplicate upload sessions make
both worse. Gaps 1 and 2 should be decided on as launch blockers before the
November 2026 ETEN Summit. The PM resolution flow (F) is not built yet.

**Follow-up required:**

- [ ] All identified gaps have corresponding GitHub issues.
- [ ] Mobile and API dependencies are cross-linked.
- [ ] Launch-blocking gaps are clearly identified.
- [ ] Assessment has been reviewed and merged.

**Merged assessment:** _(pending PR merge; final link posted on #533)_
