# Returning Online and Synchronizing Changes Audit

> **Status: device run done; gaps not filed yet.** Eleven gaps confirmed on a
> physical device (G1–G11). Code read on `main` + PR #559 @ `09ff2fd`.

## Overview

**Feature:** Coming back online after working offline — server reachability
as the definition of "online", automatic upload of takes recorded offline,
the Wi-Fi / cellular transport rule, the Sync page (states, progress,
Pause / Resume / Cancel / Sync Now, failure copy), the background upload
notification, the header cloud icon, and syncing other offline changes
(stage advancement, claims, metadata) on reconnect  
**Auditor:** Jonathan Seehagen (`@JonathanSeehagen`)  
**Date tested:** 2026-09-25 to 2026-09-28  
**Build/version:** local debug build (`npm run android`, USB + Metro) of `09ff2fd` (PR #559 head). B.7 and the second H.24 device used the nightly `1.0.0` of `main` (no #559). The notification path (`uploadProgressNotification.ts`, `recordingSync.ts`, the foreground module) is the same in both builds; the orchestrator, connectivity and Sync / Home screens differ  
**Environment:** `https://dev.api.fluent.bible` (`.env`)  
**Device and OS:** Xiaomi Redmi Note 9 Pro, Android 10 (API 29), physical device  
**Audit sub-issue:** [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530) (epic [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526))

## Related Issues

Product specs (source of expected behavior):

- [#150](https://github.com/eten-tech-foundation/fluent-mobile/issues/150) — Upload trigger and sync engine: online = server reachable, auto-upload, cellular gate, mid-upload drop, Pause / Cancel (Closed)
- [#149](https://github.com/eten-tech-foundation/fluent-mobile/issues/149) — Sync page core layout and upload progress (Closed)
- [#151](https://github.com/eten-tech-foundation/fluent-mobile/issues/151) — Sync page action controls (Closed)
- [#152](https://github.com/eten-tech-foundation/fluent-mobile/issues/152) — Background sync notification with upload progress (Closed)
- [#146](https://github.com/eten-tech-foundation/fluent-mobile/issues/146) — Upload/Download over cellular toggle (Closed)
- [#38](https://github.com/eten-tech-foundation/fluent-mobile/issues/38) — Cloud sync status icon, online/offline × synced/syncing/pending (Closed)
- [#147](https://github.com/eten-tech-foundation/fluent-mobile/issues/147) — Download queue section on the Coming Back Online (Sync) screen (Open; PRs #272 and #436 merged)
- [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) — Local stage advancement queue, synced on reconnect (Open; not built)
- [#256](https://github.com/eten-tech-foundation/fluent-mobile/issues/256) — Conflict detection for offline takes (Open; mobile side merged in PR #440, server in fluent-api#271)
- [#260](https://github.com/eten-tech-foundation/fluent-mobile/issues/260) — Conflict indicator on chapter lists (Closed)
- [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) — Reconnect claim sync and conflict detection (Open)

Engineering:

- [#117](https://github.com/eten-tech-foundation/fluent-mobile/issues/117) / [#100](https://github.com/eten-tech-foundation/fluent-mobile/issues/100) / [#102](https://github.com/eten-tech-foundation/fluent-mobile/issues/102) — Recording sync epic, upload worker, R2 contract (Closed)
- [#101](https://github.com/eten-tech-foundation/fluent-mobile/issues/101) — Sync status surfaced in UI, live pending counts, failed state (Closed)
- [#105](https://github.com/eten-tech-foundation/fluent-mobile/issues/105) — Upload attribution to the recording's owner (Closed)
- [#253](https://github.com/eten-tech-foundation/fluent-mobile/issues/253) — Wire Sync page controls to the upload orchestrator (Closed)
- [#291](https://github.com/eten-tech-foundation/fluent-mobile/issues/291) / [#292](https://github.com/eten-tech-foundation/fluent-mobile/issues/292) — Session durability; sync 401 sets re-auth instead of logging out (Closed)
- [#547](https://github.com/eten-tech-foundation/fluent-mobile/issues/547) — Refresh `recordings-sync-contract.md` for fluent-api `main` (Open, docs)

Bug fixes and regressions:

- [#469](https://github.com/eten-tech-foundation/fluent-mobile/issues/469) — Upload sent the wrong `bibleTextId` (Closed)
- [#470](https://github.com/eten-tech-foundation/fluent-mobile/issues/470) — Claim queue hardening and metadata error visibility on Sync (Closed; PR #472)
- [#545](https://github.com/eten-tech-foundation/fluent-mobile/issues/545) — Sync Now no-op while pending uploads remain (Closed; PR #563)
- [#548](https://github.com/eten-tech-foundation/fluent-mobile/issues/548) — Sync page shows `recordings.upload_error` (Closed)
- [#546](https://github.com/eten-tech-foundation/fluent-mobile/issues/546) — One transport policy for upload and download (Open; **PR #559 open, changes requested**; this audit is based on its head)
- [#572](https://github.com/eten-tech-foundation/fluent-mobile/issues/572) — Pause in-flight downloads when transport becomes blocked (Closed without a fix)

Adjacent (owned by sibling audits, listed for cross-reference):

- [#529](https://github.com/eten-tech-foundation/fluent-mobile/issues/529) — Going offline audit (Prepare for Offline, download resume; Gap 7 → #257)
- [#533](https://github.com/eten-tech-foundation/fluent-mobile/issues/533) — Offline chapter assignment audit ([#270](https://github.com/eten-tech-foundation/fluent-mobile/issues/270) offline claiming, [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) reconnect claim sync)
- [#528](https://github.com/eten-tech-foundation/fluent-mobile/issues/528) — Play, record, and re-record audio audit (offline recording)
- [#534](https://github.com/eten-tech-foundation/fluent-mobile/issues/534) — Pericope view audit ([#584](https://github.com/eten-tech-foundation/fluent-mobile/issues/584) pericope takes are never uploaded, [#585](https://github.com/eten-tech-foundation/fluent-mobile/issues/585))

## Expected Behavior

Consolidated from the specs above. Where a later ticket supersedes an earlier
one, the later ticket wins (#546 extends #150's cellular gate to downloads).

- **Online:** "online" means the Fluent server answers, not just that the
  device has a network. Offline states apply whenever the server is
  unreachable (#38, #150).
- **Header icon:** online synced = `cloud-check` (green check); syncing =
  `cloud` + `refresh-cw`; pending = `cloud-upload` (yellow arrow); offline =
  the same icons in gray. Tapping it is the only entry to the Sync page
  (#38, #149).
- **Auto-upload:** when the server becomes reachable over Wi-Fi, takes
  recorded offline upload automatically with no prompt. On cellular they wait
  for Wi-Fi unless "Upload/Download over cellular" is on (#150, #146). One
  transport rule applies to upload and download (#546).
- **Mid-upload drop:** if the server becomes unreachable during an upload,
  the upload pauses silently (no error for the interruption) and resumes when
  the server is reachable again (#150).
- **Sync page:** the icon animates while syncing. The progress bar shows
  "Uploading" and "X of Y chapters uploaded", updated in real time. Paused
  shows the frozen bar, "Paused" and the next auto-retry time. "Upload
  complete" when uploads are done; "All synced" when uploads and downloads
  are done (#149).
- **Controls:** Syncing → Pause + Cancel. Paused → Resume + Sync Now +
  Cancel. Pending → Sync Now, disabled on cellular with the toggle off, with
  "Connect to WiFi to sync, or enable cellular uploads in Settings." No
  controls when complete (#151). Pause blocks auto-upload for 24 hours; Sync
  Now overrides it. Cancel stops at once and auto-upload fires again on the
  next reconnect (#150). Offline, Sync Now is not actionable or explains why
  (#545).
- **Failures:** failed takes show the stored failure reason on the Sync page
  and clear after a successful retry (#548). Pending counts match what the
  uploader will process (#545). A sync 401 asks for re-auth and keeps local
  data (#292).
- **Notification:** while uploading in the background, a persistent
  notification "Uploading your recordings" / "X of Y chapters uploaded",
  updated per chapter, that opens the Sync page and clears on complete,
  pause or cancel (#152).
- **Downloads on reconnect:** a subdued Downloads section below the controls
  shows queue progress when the queue is not empty (#147).
- **Other offline changes:** queued stage changes sync on reconnect before
  audio, in order; a server rejection keeps the lower stage (#257, open).
  Offline claims sync on reconnect; conflicts show on the chapter row
  (#271, open; #533). Takes that conflict on the server show the conflict
  indicator (#256, #260).

## Code Review Notes (pre-device)

Read on `main` + PR #559 @ `09ff2fd` (PR #559 head, which already contains
`main` @ `fb634e5`). PR #559 is open with changes requested, so the device
run used a local build of `09ff2fd`, except B.7 and the second H.24 device
(nightly; see Overview).

- **Mock data (epic rule): none.** No mocks, stubs or placeholders in the
  upload and sync path (`uploadOrchestrator*.ts`, `recordingSync.ts`,
  `sync.ts`, `chapterClaimSync.ts`, `stageAdvance.ts`, `SyncScreen.tsx`, the
  Sync hooks and components). The only mocks in `src/mocks/` belong to
  Prepare for Offline (#529, #504).
- **Upload orchestrator (#150).** Online is `/health` reachability
  (`src/services/connectivity.ts:80-90`). The transport gate is the shared
  `transportAllowsTransfer` from PR #559 (`src/utils/transportPolicy.ts:35-48`,
  used at `src/services/uploadOrchestratorCore.ts:146` and `:233`). Losing
  the server aborts the session at once (`uploadOrchestratorCore.ts:283-295`);
  the next online edge re-queries pending chapters and starts over, so resume
  is per chapter. Pause writes a 24 h window; Cancel suppresses auto-start
  until the next online edge (`:332-357`).
- **Auto-upload only runs on events.** A session starts only on a
  connectivity change, a cellular-toggle change, app start
  (`startUploadOrchestrator`, `src/navigation/AuthSessionProvider.tsx:110`)
  or Sync Now (`uploadOrchestratorCore.ts:271-314`, `:352-357`). Nothing starts one when
  a take is recorded while already online, when the 24 h pause window
  expires, or after a session fails (`:210-217` emits `idle` and stops).
- **Mid-upload drop can mark takes failed.** The worker tries a network
  error 3 times (2 retries, 0.5 s and 1 s backoff), then marks the take `failed`
  with an error (`src/services/recordingSync.ts:276-309`,
  `src/services/verseAudioContract.ts:77-79`). The connectivity event that
  aborts the session needs NetInfo plus a `/health` probe of up to 5 s
  (`connectivity.ts:4`, `:126-132`), so takes can be marked failed (red
  cloud, error copy) before the silent pause. They retry on the next session
  (`src/db/repository.ts:1005`), so no data is lost.
- **Progress mixes chapters and takes.** The orchestrator emits
  `start` / `progress` per chapter (`uploadOrchestratorCore.ts:182`, `:199`),
  but the worker emits the same events per take, including `complete` after
  each chapter (`recordingSync.ts:348`, `:375-382`). The Sync page progress
  (`src/hooks/usePendingUploads.ts:74-117`) and the notification
  (`src/services/uploadProgressNotification.ts:25-41`, `:186-194`) consume
  both, so "X of Y chapters uploaded" can show take counts, restart per
  chapter, and the notification (and the foreground service that keeps the
  upload alive, #152) is cleared after each chapter.
- **"All synced" is never shown.** `deriveSyncPageStatus` never returns
  `allComplete` ("blocked on download-queue signal",
  `src/utils/deriveSyncPageStatus.ts:4-6`), so the Sync page stops at
  "Upload complete" (#149, #147).
- **Offline stage advancement never reaches the server.** The local stage
  updates, and the submit is skipped when the server is unreachable
  (`src/services/stageAdvance.ts:18-40`); nothing retries it (#257 not
  built). The next chapter-assignment pull overwrites `status`
  unconditionally (`src/db/repository.ts:317-331`), so if the server returns
  that assignment, the local stage reverts to the server's value.
- **Metadata sync on reconnect.** Pending claims and the full metadata sync
  (`syncAllUsers` / `syncAllData`, `src/services/sync.ts:840`, `:979`) run
  only at sign-in, re-auth, the Home "needs download sync" repair
  (`src/app/screens/HomeScreen.tsx:150-163`) and Sync Now
  (`src/app/screens/SyncScreen.tsx:122-132`). Opening a chapter list calls
  `refreshChapterMetadataIfOnline` (`sync.ts:1142-1190`), which pulls
  projects and assignments but does not push pending claims. Reconnecting
  alone uploads takes but does not push claims (#271, #533).
- **Conflicts.** Mobile sends `baseVersionToken` and marks the take and the
  chapter conflicted when the server answers `conflict`
  (`recordingSync.ts:182-217`, PR #440). Needs two devices to verify.
- **Failure copy and Sync Now (#545, #548).** Sync Now is disabled while
  offline, waiting for Wi-Fi, when Fluent is unreachable, or with nothing
  uploadable (`SyncScreen.tsx:96-105`). Only the first two show a hint
  (`:107-114`); the others rely on the "Can't reach Fluent" pill or the
  unuploadable message (`:188-195`); the latest `upload_error` is shown when takes
  failed (`SyncScreen.tsx:196-200`).

## Test Results

Scenario numbers match the device test script used for this audit
(section letter + step).

| # | Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| A.1 | Online on Wi-Fi, nothing pending | Header `cloud-check` green; Sync page "Upload complete" / "All synced", no controls (#38, #149, #151) | Opens with the header cloud gray (struck out), then turns green only after navigating back; once showed the offline-pending icon with Wi-Fi on | **Fail** → G3, G5 |
| A.2 | Airplane mode, nothing pending | Header `cloud-check` gray (#38) | Sync page shows gray `cloud-check`; the header shows the struck-out cloud (`CloudOff`), not `cloud-check` | **Fail** → G5 |
| B.3 | Offline: record takes in 2+ chapters | Header shows the gray pending variant; chapter rows show pending (#38, #257) | Home header keeps the struck-out cloud with no arrow; the chapter screen and the Sync page show the pending (arrow) variant. Home updates only after an app restart, also after deleting the take | **Fail** → G5 |
| B.4 | Offline: open Sync page | Offline copy; Sync Now not actionable, with a reason (#545) | Sync page: offline, upload pending | Pass |
| B.5 | Turn Wi-Fi on (toggle off), stay on Home | Upload starts on its own, no prompt; header shows syncing (#150, #38) | Upload started on its own | Pass |
| B.6 | Open Sync page during upload | Animated icon; "Uploading"; "X of Y chapters uploaded" counts chapters and never goes backwards; Pause + Cancel (#149, #151) | App crashed: `RemoteServiceException: Context.startForegroundService() did not then call Service.startForeground()` (`UploadSyncForegroundService`). Counter showed "8 of 3 chapters uploaded" (267%) | **Fail** → G1, G2 |
| B.7 | Background the app during upload | One persistent notification "Uploading your recordings" / "X of Y chapters uploaded", no flicker between chapters; tap opens Sync (#152) | Nightly (`main`, same notification code as `09ff2fd`): the notification appears but disappears and reappears during the upload; the count restarts (e.g. 0→5, then 0→1) | **Fail** → G1, G2 |
| B.8 | Upload finishes | Notification clears; "Upload complete"; header `cloud-check` green; chapter rows synced (#149, #152, #38) | Debug run: no notification. After 7 chapters uploaded and Sync showed all synced, the My Work header still showed pending | **Fail** → G1, G5 |
| C.9 | Pending takes, cellular only, toggle off | No upload; Sync Now disabled with "Connect to WiFi to sync, or enable cellular uploads in Settings." (#150, #151, #546) | As expected | Pass |
| C.10 | Same, then turn the toggle on | Upload starts on its own (#150, #146) | Turning the toggle on during a pending upload on mobile data: the app closed with no error (second run). First run: upload started only after leaving and reopening Sync | **Fail** → G1 (probable), G3 |
| C.11 | Pending takes, cellular, toggle off → Wi-Fi on | Upload starts on its own (#150) | Upload started; a red "Sync failed: master data" stayed on Sync and did not clear | Pass → G4 |
| D.12 | Syncing → Pause | Bar frozen; "Paused"; "Resumes automatically in 23h …"; Resume + Sync Now + Cancel; notification clears (#149, #151, #152) | As expected; countdown starts at "24h 0m" | Pass |
| D.13 | Paused → toggle airplane off/on | Stays paused, no upload (24 h window) (#150) | Not reported (as expected) | Pass |
| D.14 | Paused → Resume (or Sync Now) | Upload restarts; pause window cleared (#150, #151) | Resume restarts the upload. Right after reconnecting on Sync, Resume/Sync Now became disabled with "Can't reach Fluent" until leaving and reopening the page | Pass → G3 |
| D.15 | Syncing → Cancel | Stops at once; Sync Now shown; no automatic retry while connectivity stays the same (#150, #151) | Not reported (as expected) | Pass |
| D.16 | After Cancel → airplane on, then off | Auto-upload fires again (#150) | Auto-upload fires again; the status flickers between states while it runs | Pass → G2 |
| E.17 | Syncing → airplane mode for 30 s → off | Silent pause, no failed state or error; resumes on its own (#150) | Sync page shows the raw error "fetch failed: java.net.UnknownHostException: Unable to resolve host \"dev.api.fluent.bible\": No address associated with hostname"; when Wi-Fi returns the upload restarts on its own and the message clears | **Fail** → G6 |
| E.18 | Syncing → kill the app → relaunch online | Upload resumes; no take stuck "uploading" (#150, #100) | Upload resumed; the percentage showed 133% | Pass → G2 |
| E.19 | Already online: record a new take and wait 2 min on Home | Take uploads without any action (#150 auto-upload) | Waited 5 minutes: nothing uploaded; Sync page showed Sync Now enabled | **Fail** → G7 |
| F.20 | A take failed to upload (if one occurs) | Sync page shows the failure reason; Sync Now retries and the error clears after success (#548, #101) | Covered by E.17: the failure reason showed on Sync and cleared after the automatic retry succeeded (the text is a raw technical message) | Pass → G6 |
| F.21 | Pending count vs Sync result | The count on Sync matches what uploads; nothing left pending after "Upload complete" (#545) | As expected | Pass |
| G.22 | Offline: "Send to Peer Check" on a fully recorded chapter → reconnect (Wi-Fi) → Sync Now | The stage reaches the server (web / PM shows Peer Check); the local stage does not revert (#257, #258) | Offline: after Send, the chapter left My Work and Projects showed Peer Check. On Wi-Fi a sync ran on its own and the chapter returned to My Work as Draft with the Send to Peer Check button again; web also shows Draft; Sync shows nothing to upload and no Sync Now | **Fail** → G8 |
| G.23 | Offline: claim an unassigned chapter by recording → reconnect | Claim reaches the server (owned by #533) | Seen during the H.24 attempt (debug build, 2026-09-28 log): a take recorded offline in an unclaimed Esther 4 chapter queued an offline claim (`Enqueued offline chapter claim`, assignment 41863). On reconnect the upload ran before the claim was pushed and failed with HTTP 404 "Verse audio recording not found" (`retryable: false`); the Sync page kept showing failed uploads until the takes were deleted or the user signed out and in | **Fail** → G9 |
| H.24 | Two devices record the same verse offline → both reconnect | Conflict indicator on the chapter row; no silent overwrite (#256, #260) | Could not finish: the two-device setup hit G9 and stale sync errors ("Sync failed: pericope sets" / "bible texts" while offline) on the nightly device | Blocked (setup; re-run after G9) |
| I.25 | Reconnect with the download queue non-empty | Downloads section below the controls with progress; hidden when empty (#147) | Downloads section shows below the controls with progress and "Manage downloads"; it hides once the queue is empty. Back from Manage downloads needs two taps (project screen, then the Prepare for Offline picker) to return to Sync | Pass → G10 |
| I.26 | Uploads and downloads both done | "All synced" (#149) | "Upload complete" (with the "Online · all synced" title); the #149 "All synced" state never shows | **Fail** → G11 |

## Offline and Synchronization Results

Returning online is this feature. Going offline belongs to #529 and offline
claiming to #533.

| Scenario | Result | Notes |
|---|---|---|
| Feature used while offline | N/A | Covered by #529; B.3–B.4 only set up pending work |
| App closed and reopened offline | N/A | Covered by #529 scenario G.23 |
| Device returns online | Fail | Auto-upload starts (B.5, C.11, D.16), but reachability goes stale (G3), progress is wrong (G2), the notification crashes the app (G1), a drop mid-upload marks takes failed (G6) and takes recorded online never upload (G7) |
| Offline changes synchronize | Fail | Takes upload (B.5–B.8, E.18); stage changes are lost (G.22, G8); takes in chapters claimed offline fail with 404 (G.23, G9) |
| Conflicting changes are handled | Blocked | H.24 could not be set up (G9); claim conflicts #271 / #533 |

## Gaps Identified

Existing issues were searched before routing (sync, upload, online,
reconnect, pending, notification, conflict, stage, claim, cellular). Gaps 1–7
become new issues; Gaps 8–11 become comments on existing open issues. Not
filed yet.

### Gap 1: The upload foreground service crashes the app

**Severity:** High  
**Launch blocker:** To be decided with product  
**Related issue:** [#152](https://github.com/eten-tech-foundation/fluent-mobile/issues/152) (closed), [#150](https://github.com/eten-tech-foundation/fluent-mobile/issues/150)  
**Development task:** _(pending)_

**Description:**  
Every notification `start` and `update` calls `startForegroundService()`
(`modules/upload-sync-foreground/android/src/main/java/expo/modules/uploadsyncforeground/UploadSyncForegroundModule.kt:14-36`),
and the JS clears it on each `complete` / `idle`
(`src/services/uploadProgressNotification.ts:25-41`). The worker emits
`complete` after every chapter (`src/services/recordingSync.ts:382`), and one
reconnect starts several concurrent sessions: `runSession` guards on
`sessionPromise` (`src/services/uploadOrchestratorCore.ts:131`) but only sets
it at `:220`, after two awaits (`:143`, `:170`), and `evaluateAuto` does not
await it (`:263-264`). The `:143` await is new in PR #559 (a `/health` probe
of up to 5 s) and widens the window. `stopService()` then runs before the
service calls `startForeground()`, and Android kills the app.

**Steps to reproduce:**

1. Record takes offline in 2+ chapters.
2. Turn Wi-Fi back on and open the Sync page (or background the app).

**Expected behavior:** one notification for the session; no crash.  
**Actual behavior:** `RemoteServiceException: Context.startForegroundService()
did not then call Service.startForeground()`; the app closes.  
**Evidence:** B.6 (red box), C.10 (app closed), B.7 / B.8 (notification
flickers or is missing). The 2026-09-28 log shows five "Upload session
started" for one chapter within 300 ms and five notification start/clear
pairs within 200 ms. The device crash buffer holds the same exception on
2026-09-04 and 2026-09-21, before PR #559.

### Gap 2: Upload progress counts takes and contradicts the page state

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#149](https://github.com/eten-tech-foundation/fluent-mobile/issues/149), [#152](https://github.com/eten-tech-foundation/fluent-mobile/issues/152) (closed)  
**Development task:** _(pending)_

**Description:**  
The orchestrator emits `start` / `progress` per chapter
(`uploadOrchestratorCore.ts:182`, `:199`); the worker emits the same event
types per take (`recordingSync.ts:348`, `:375-382`). The Sync page progress
(`src/hooks/usePendingUploads.ts:74-117`) and the notification consume both.
The status line falls back to "Online · all synced" whenever nothing is
pending (`src/app/screens/SyncScreen.tsx:344-358`), even while the progress
card shows Paused.

**Steps to reproduce:**

1. Record several takes offline in 3 chapters.
2. Reconnect on Wi-Fi and open the Sync page; background the app.

**Expected behavior:** "X of Y chapters uploaded" with Y = chapters, never
above 100% or going backwards; one consistent page state.  
**Actual behavior:** "8 of 3 chapters uploaded" (267%), 133% after a
relaunch, "Online · all synced" above "Paused"; the notification count
restarts per chapter.  
**Evidence:** B.6 (screenshot), B.7, D.16, E.18.

### Gap 3: Server reachability goes stale after reconnect and on cold start

**Severity:** Medium (to be confirmed with product: it can block auto-upload)  
**Launch blocker:** No  
**Related issue:** [#150](https://github.com/eten-tech-foundation/fluent-mobile/issues/150), [#38](https://github.com/eten-tech-foundation/fluent-mobile/issues/38) (closed), [#546](https://github.com/eten-tech-foundation/fluent-mobile/issues/546)  
**Development task:** _(pending)_

**Description:**  
Each NetInfo event starts a `/health` probe of up to 5 s
(`src/services/connectivity.ts:4`, `:126-138`); results are applied in
arrival order with no sequencing (`src/hooks/useConnectivity.ts:50-80`). A
probe that failed while DNS was not ready can override a later success, and
the state stays offline until the next network event or screen focus. The
orchestrator uses the same subscription.

**Steps to reproduce:**

1. Open the app on Wi-Fi; or, on the Sync page, turn airplane mode off.

**Expected behavior:** online state within seconds of the server being
reachable.  
**Actual behavior:** gray header on launch until navigating back; "Can't
reach Fluent" with Resume / Sync Now disabled until reopening Sync; turning
the cellular toggle on did not start the upload until reopening Sync.  
**Evidence:** A.1, C.10, D.14.

### Gap 4: Network failures stay on the Sync page as sync errors

**Severity:** Low  
**Launch blocker:** No  
**Related issue:** [#470](https://github.com/eten-tech-foundation/fluent-mobile/issues/470) (closed), [#18](https://github.com/eten-tech-foundation/fluent-mobile/issues/18) (closed)  
**Development task:** _(pending)_

**Description:**  
A metadata step that fails on a flapping connection stores the DNS error as
`sync_error_*` (`src/services/sync.ts:121-168`). Keys clear when that step
next succeeds, but master data, pericope sets and Bible texts run only in
the full sync. `useSync` recomputes the text only when `isSyncing` changes
and skips the refresh while in the error state
(`src/hooks/useSync.ts:36-58`, `:91-100`).

**Steps to reproduce:**

1. Tap Sync Now while the connection is unstable (or offline).
2. Reconnect and let uploads finish.

**Expected behavior:** no sync error once the connection is back and sync
succeeds; offline is shown as offline, not as a failure.  
**Actual behavior:** "Sync failed: master data" (and "pericope sets" /
"bible texts") stays next to "all synced", also offline, until sign-out.  
**Evidence:** C.11, H.24 attempt; 2026-09-28 log (`Sync error stored`,
`sync_error_chapter_assignments`, DNS failure).

### Gap 5: The header sync icon is stale and uses the wrong offline glyph

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#38](https://github.com/eten-tech-foundation/fluent-mobile/issues/38), [#101](https://github.com/eten-tech-foundation/fluent-mobile/issues/101) (closed)  
**Development task:** _(pending)_

**Description:**  
Home, the chapter screen, ViewProject and Sync each run their own
`useSyncStatus` / `usePendingUploads` instance with no shared store. The
pending state reloads only on upload events or a `refreshKey` bump
(`src/hooks/usePendingUploads.ts:99-148`), not on focus or when a take is
recorded or deleted. Offline with nothing pending, the header draws
`CloudOff` (`src/components/ui/CloudSyncStatusIcon.tsx:297-303`); #38 and the
Sync page use gray `cloud-check`.

**Steps to reproduce:**

1. Offline, record a take and go back to Home; then delete it.
2. Online, let uploads finish on Sync and go back to My Work.

**Expected behavior:** every header shows the same, current state (#38).  
**Actual behavior:** Home keeps the old icon until an app restart; after all
uploads, My Work still shows pending; after deleting a failed take, Sync
shows a green check, Home a red arrow and the chapter screen green.  
**Evidence:** A.1, A.2, B.3, B.8.

### Gap 6: A connection drop mid-upload marks takes failed with a raw error

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#150](https://github.com/eten-tech-foundation/fluent-mobile/issues/150), [#548](https://github.com/eten-tech-foundation/fluent-mobile/issues/548) (closed)  
**Development task:** _(pending)_

**Description:**  
The worker tries a network error 3 times (2 retries, 0.5 s and 1 s backoff),
then marks the take failed (`src/services/recordingSync.ts:32`, `:276-317`,
`src/services/verseAudioContract.ts:77-79`), before the connectivity event
aborts the session. Network errors get no friendly mapping
(`src/utils/sanitizeUploadError.ts:12-31`). #150 asks for a silent pause.
Takes re-upload on reconnect, so no data is lost.

**Steps to reproduce:**

1. Start an upload; turn on airplane mode for 30 s; turn it off.

**Expected behavior:** silent pause, no error; resume on reconnect.  
**Actual behavior:** "fetch failed: java.net.UnknownHostException: Unable to
resolve host …" on Sync; it clears after the automatic retry.  
**Evidence:** E.17, F.20.

### Gap 7: Takes recorded while already online never upload on their own

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#150](https://github.com/eten-tech-foundation/fluent-mobile/issues/150) (closed)  
**Development task:** _(pending)_

**Description:**  
Sessions start only on a connectivity or cellular-toggle change, app start,
or Sync Now (`src/services/uploadOrchestratorCore.ts:271-314`, `:352-357`).
Saving a take, the end of the 24 h pause window and a failed session
(`:210-217`) never start one.

**Steps to reproduce:**

1. Online on Wi-Fi, record a take and wait on Home.

**Expected behavior:** the take uploads without user action.  
**Actual behavior:** nothing uploaded after 5 minutes; Sync Now enabled.  
**Evidence:** E.19.

### Gap 8: An offline stage advance is lost on reconnect

**Severity:** High (the handoff to the peer checker is lost with no warning)  
**Launch blocker:** To be decided with product  
**Related issue:** [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) (open, not built), [#258](https://github.com/eten-tech-foundation/fluent-mobile/issues/258), #529 Gap 7  
**Development task:** _(pending: comment on #257; no new issue)_

**Description:**  
The submit is skipped offline and never retried
(`src/services/stageAdvance.ts:18-40`); the next assignment pull overwrites
the local `status` unconditionally (`src/db/repository.ts:317-331`).

**Steps to reproduce:**

1. In airplane mode, "Send to Peer Check" on a fully recorded chapter.
2. Turn Wi-Fi on; open My Work, Projects and the web app.

**Expected behavior:** the stage reaches the server on reconnect; the local
stage does not revert (#257).  
**Actual behavior:** the chapter returns to Draft in My Work with the Send
button again; web shows Draft; Sync shows nothing pending.  
**Evidence:** G.22.

### Gap 9: Takes in a chapter claimed offline fail with 404 on reconnect

**Severity:** High  
**Launch blocker:** To be decided with product  
**Related issue:** [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) (open), [#270](https://github.com/eten-tech-foundation/fluent-mobile/issues/270), sibling audit [#533](https://github.com/eten-tech-foundation/fluent-mobile/issues/533)  
**Development task:** _(pending: comment on #271; no new issue)_

**Description:**  
Uploads start on the reconnect edge, but offline claims are pushed only by
the full metadata sync (`syncPendingChapterClaimsForUser`,
`src/services/sync.ts:301-341`, called only from `:900` and `:1025`: Sync
Now, sign-in, re-auth and the Home "needs download sync" repair). The server answers 404 "Verse audio recording not
found" (non-retryable), and the take is marked failed.

**Steps to reproduce:**

1. Offline, record a take in an unassigned chapter (claimed on first
   recording).
2. Turn Wi-Fi on.

**Expected behavior:** the claim syncs before the audio; the take uploads.  
**Actual behavior:** the take fails with "Verse audio recording not found";
failed uploads stay until the takes are deleted or the user signs out and
in.  
**Evidence:** G.23; 2026-09-28 log (`Enqueued offline chapter claim`,
assignment 41863; HTTP 404, `retryable: false`).

### Gap 10: Back from "Manage downloads" needs two taps

**Severity:** Low  
**Launch blocker:** No  
**Related issue:** [#147](https://github.com/eten-tech-foundation/fluent-mobile/issues/147) (open), [#503](https://github.com/eten-tech-foundation/fluent-mobile/issues/503) (closed)  
**Development task:** _(pending: comment on #147, with Gap 11)_

**Description:**  
Sync pushes Prepare for Offline with a `projectId`
(`src/app/screens/SyncScreen.tsx:248-255`), which lands on the project
screen above the picker.

**Steps to reproduce:** on Sync with downloads queued, tap Manage downloads,
then back.  
**Expected behavior:** one back returns to Sync.  
**Actual behavior:** back shows the Prepare for Offline picker; a second
back returns to Sync.  
**Evidence:** I.25.

### Gap 11: The Sync page never reaches the "All synced" state

**Severity:** Low  
**Launch blocker:** No  
**Related issue:** [#149](https://github.com/eten-tech-foundation/fluent-mobile/issues/149) (closed), [#147](https://github.com/eten-tech-foundation/fluent-mobile/issues/147) (open)  
**Development task:** _(pending: comment on #147, with Gap 10)_

**Description:**  
`deriveSyncPageStatus` never returns `allComplete` ("blocked on
download-queue signal", `src/utils/deriveSyncPageStatus.ts:4-6`).

**Steps to reproduce:** let uploads and downloads finish; open Sync.  
**Expected behavior:** "All synced" in place of the progress bar (#149).  
**Actual behavior:** "Upload complete".  
**Evidence:** I.26.

## Open Questions

- #257 is open and not built. Is offline stage advancement in scope for the
  November 2026 launch, and should the drafted chapter stay visible with a
  pending state until it syncs (#529 Gap 7)?
- #529 scenario G.22 recorded the offline header as gray `cloud-check`
  (Pass), but `offline_synced` maps to `CloudOff` on `main` too
  (`CloudSyncStatusIcon.tsx:297-303`, not touched by #559), and this run
  shows `CloudOff` (A.2). #529 likely read the Sync page glyph. Confirm the
  expected header glyph with product (Gap 5).
- #152 counts chapters, but the worker reports takes. Should the Sync page
  and the notification count chapters (spec) or takes?
- Should reconnect also run the metadata sync (claims, assignments), or only
  uploads? #271 says claims sync "as part of the standard sync cycle".

## Audit Summary

**Overall result:** Fail

**Summary:**  
On a physical Android 10 device, the core reconnect path works: takes
recorded offline upload on their own when Wi-Fi returns, the cellular gate
from PR #559 holds (C.9, C.11), Pause / Resume / Cancel / Sync Now behave as
specified, an app kill resumes the upload, and the Downloads section
renders.

The sync is not reliable enough to trust, though. The upload notification
crashes the app (G1, seen in the crash buffer since 2026-09-04), and one
reconnect starts five concurrent upload sessions. Two kinds of offline work
are lost or blocked on reconnect: an offline "Send to Peer Check" silently
reverts to Draft on the device and never reaches the server (G8, #257), and
takes in a chapter claimed offline fail with a 404 until the user deletes them
(G9, #271). G1, G8 and G9 are High and should be decided on as launch
blockers before the November 2026 ETEN Summit. The rest degrade trust in the
sync chrome: stale reachability (G3), wrong progress (G2), stale sync errors
(G4), a stale header icon (G5), failures shown for a normal connection drop
(G6), takes recorded online that never upload (G7), a double back from
Manage downloads (G10) and no "All synced" state (G11).

**Follow-up required:**

- [ ] All identified gaps have corresponding GitHub issues.
- [ ] Mobile and API dependencies are cross-linked. _(no new API work
      found; #256 server side is fluent-api#271)_
- [x] Launch-blocking gaps are clearly identified. _(G1, G8, G9: to be
      decided with product)_
- [ ] Assessment has been reviewed and merged.

**Merged assessment:** _(pending PR merge; final link posted on #530)_
