# Going Offline Audit

> **Status: device run done; gaps not filed yet.** Gaps 1–7 are confirmed on
> device: 1–4 will be new issues, and 5–7 comments on #504, #546 and #257.
> E.19 is re-tested after PR #559 (#546) merges.

## Overview

**Feature:** Preparing a device before losing connectivity and working once
offline — the Prepare for Offline auto-prompt and Settings entry, chapter
selection, tiered resource download, Pause/Resume/Cancel, device storage
management, the Wi-Fi / cellular transport rule, the offline header state, and
using the app (lists, drafting, Bible and Resources tabs, account switching)
with no connection  
**Auditor:** Jonathan Seehagen (`@JonathanSeehagen`)  
**Date tested:** 2026-09-24  
**Build/version:** Nightly `1.0.0` (scheduled), release build of `main` @ `d5b9e64`. C.14 and G.31 were run on a local debug build of the same commit (`npm run android`), which `adb run-as` requires  
**Environment:** `https://dev.api.fluent.bible` (EAS build profile in `eas.json`)  
**Device and OS:** Xiaomi Redmi Note 9 Pro, Android 10 (API 29), physical device  
**Audit sub-issue:** [#529](https://github.com/eten-tech-foundation/fluent-mobile/issues/529) (epic [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526))

## Related Issues

Product specs (source of expected behavior):

- [#39](https://github.com/eten-tech-foundation/fluent-mobile/issues/39) — Prepare for Offline trigger and re-surface logic (Closed)
- [#50](https://github.com/eten-tech-foundation/fluent-mobile/issues/50) — Prepare for Offline chapter selection (Closed)
- [#51](https://github.com/eten-tech-foundation/fluent-mobile/issues/51) — Prepare for Offline resource download (Closed; last QA comment on 2026-08-25 still listed two open issues, see Code Review Notes)
- [#52](https://github.com/eten-tech-foundation/fluent-mobile/issues/52) — Prepare for Offline download controls (Closed)
- [#53](https://github.com/eten-tech-foundation/fluent-mobile/issues/53) — Prepare for Offline storage management (Closed)
- [#146](https://github.com/eten-tech-foundation/fluent-mobile/issues/146) — Upload/Download over cellular toggle (Closed)
- [#38](https://github.com/eten-tech-foundation/fluent-mobile/issues/38) — Cloud sync status icon, online/offline states (Closed)
- [#87](https://github.com/eten-tech-foundation/fluent-mobile/issues/87) — Account switching with offline handling (Closed)
- [#192](https://github.com/eten-tech-foundation/fluent-mobile/issues/192) — Reuse offline sync model for the Resources tab (Closed)
- [#504](https://github.com/eten-tech-foundation/fluent-mobile/issues/504) — Wire Tier 2/3 resources to the API in Customize download (Open; PR #562 open)
- [#508](https://github.com/eten-tech-foundation/fluent-mobile/issues/508) — Observer offline draft download (Open; not built)

Engineering:

- [#201](https://github.com/eten-tech-foundation/fluent-mobile/issues/201) — Download queue and resource inventory (Closed; PR #295)
- [#291](https://github.com/eten-tech-foundation/fluent-mobile/issues/291) — Offline-first auth session durability (Closed; PR #342)
- [#107](https://github.com/eten-tech-foundation/fluent-mobile/issues/107) / [#119](https://github.com/eten-tech-foundation/fluent-mobile/issues/119) — Local-first / offline dev mode (Closed)
- [#372](https://github.com/eten-tech-foundation/fluent-mobile/issues/372) — Unit tests for Prepare Offline modules (Closed)
- [#446](https://github.com/eten-tech-foundation/fluent-mobile/issues/446) — Download queue keyed on Aquifer content id (Open)
- [#494](https://github.com/eten-tech-foundation/fluent-mobile/issues/494) — Maestro smoke: Sync + Prepare for Offline (Closed)

Bug fixes and regressions:

- [#147](https://github.com/eten-tech-foundation/fluent-mobile/issues/147) — Download queue progress on the Sync page (Open; PRs #272 and #436 merged, including the cancel/re-download fixes)
- [#417](https://github.com/eten-tech-foundation/fluent-mobile/issues/417) — Reference Images stored as `kind: text`, so Images & Maps stays hidden offline (Open)
- [#483](https://github.com/eten-tech-foundation/fluent-mobile/issues/483) — Projects tab `disk I/O error` after a full sync on a physical device (Open)
- [#503](https://github.com/eten-tech-foundation/fluent-mobile/issues/503) — Back navigation from Prepare for Offline (Closed)
- [#546](https://github.com/eten-tech-foundation/fluent-mobile/issues/546) — Download start ignores the Wi-Fi/cellular gate (Open; PR #559 open)
- [#572](https://github.com/eten-tech-foundation/fluent-mobile/issues/572) — Pause in-flight downloads when transport becomes blocked (Closed without a fix: not requested; noted in PR #559 Follow-ups)

Adjacent (owned by sibling audits, listed for cross-reference):

- [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530) — Returning online and synchronizing changes audit (upload, reconnect)
- [#531](https://github.com/eten-tech-foundation/fluent-mobile/issues/531) — Viewing and listening to resources audit
- [#533](https://github.com/eten-tech-foundation/fluent-mobile/issues/533) — Offline chapter assignment audit; [#270](https://github.com/eten-tech-foundation/fluent-mobile/issues/270) offline claiming (Closed), [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) reconnect claim sync (Open)
- [#528](https://github.com/eten-tech-foundation/fluent-mobile/issues/528) — Play, record, and re-record audio audit (offline recording already passed there, I.30–I.31)
- [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) — Local stage advancement queue for offline sync (Open)
- [#256](https://github.com/eten-tech-foundation/fluent-mobile/issues/256) — Conflict detection for offline takes (Open)
- [#333](https://github.com/eten-tech-foundation/fluent-mobile/issues/333) — Milestones tab with offline controls (Open; PR #552 open)

## Expected Behavior

Consolidated from the specs above. Where a later ticket supersedes an earlier
one, the later ticket wins.

- **Auto-prompt:** when the app is open on Home and Wi-Fi is available,
  Prepare for Offline opens automatically for `Rarely Connected` projects (or
  projects with no profile), and for `Sometimes Connected` projects where the
  translator is unassigned. It does not open for `Usually Connected` projects
  or assigned `Sometimes Connected` projects (#39).
- **Re-surface:** if dismissed without downloading, the prompt re-surfaces on
  every later app open while Wi-Fi is available. It stops once Download is
  tapped (#39, #51).
- **Manual entry:** Settings → Prepare for Offline is always available (#39).
  The Sync page's Downloads section links to it through "Manage downloads"
  (#147).
- **Chapter selection:** assigned translators see "Assigned chapters (n)"
  collapsed and pre-selected. Unassigned translators see the accordion open,
  nothing selected, and Download stays disabled until at least one chapter
  is selected. Per-book "Select all", 5-column chapter grid (#50, #51).
- **Resources:** "RESOURCES TO DOWNLOAD" groups resources by name with Text /
  Audio sizes. Tier 1 (source audio, source text, translation notes) is
  locked. Customize download (collapsed) can deselect Tier 2/3, and the
  overrides reset each session. Total download and the "Download N MB" label
  update live. Download runs in tier order (#51). Customize lists only
  resources the API returns, and empty tiers are hidden (#504).
- **Controls:** after Download, Pause + Cancel replace the button. Pause
  swaps to Resume and keeps progress. Cancel stops immediately with no
  dialog, restores the Download button, and the queue resumes automatically
  on the next Wi-Fi connection. Per-item progress ring, then a green check
  (#52).
- **Storage:** "Manage Device Storage" shows available space and Fluent
  usage, lists other projects' downloads in collapsed accordions, supports
  multi-select delete with a live freed-space counter, confirms with the
  specified copy, and shows an empty state (#53).
- **Transport:** "Upload/Download over cellular" is off by default and
  mirrored between Settings and Sync. When it is off, uploads and downloads
  only start or continue on Wi-Fi, and pause automatically when Wi-Fi is lost
  (#146). Download start and resume follow the same rule as upload (#546).
- **Offline indicator:** "online" means the Fluent server is reachable. The
  header cloud turns gray when offline: `cloud-check` when nothing is
  pending, and the pending variant when uploads wait (#38).
- **Working offline:** the session survives an offline cold start (#291).
  Home, My Work and chapter screens load from SQLite. Account switching works
  offline (#87). Prepared resources are available with no network calls, and
  content that was not downloaded is shown as unavailable (#192). Stage
  advancement applies locally at once (#257, queueing is open).

## Code Review Notes (pre-device)

Read on `main` @ `d5b9e64` (`main` later moved to `a465b68`, a docs-only
commit, so every `src/` reference below still holds):

- **Mock data (epic rule): mock data is in use, and the API is ready.**
  Prepare for Offline builds its catalog from
  `MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST`
  (`src/services/prepareOfflineResources.ts:28-33`), and every queued item
  downloads a fixed public test file per kind: a PDF, an MP3 song, and an
  ETEN logo PNG (`src/utils/prepareOfflineQueueMapping.ts:20`,
  `src/mocks/prepareOffline/mockDownloadSources.ts`). fluent-api `main`
  (`49929e7`) already serves `GET /projects/{id}/translation-resources/manifest`
  and `GET /projects/{id}/source-audio/manifest`. The real builder
  `buildPrepareOfflineResourceManifest`
  (`src/services/prepareOfflineResourceManifest.ts:336`) has no callers.
  Removing the mocks is in progress under **#504** (PR #562, open, which
  deletes `src/mocks/prepareOffline/` and fetches the real manifest).
- **Silent simulated download.** If enqueueing fails,
  `enqueuePrepareOfflineDownload` falls back to
  `simulatePrepareOfflineDownloadProgress`
  (`src/services/prepareOfflineDownload.ts:41-52`), so the UI can show
  progress and completion with nothing written to disk. It ships in release
  builds (PR #322).
- **Prepared content is not read offline.** Translation Notes, Translation
  Questions and Images & Maps always load from fluent-api
  (`src/services/translationNotes.ts:107`,
  `src/services/translationQuestions.ts:107`, `src/services/imagesMaps.ts:73`).
  The offline inventory only decides which sections are visible
  (`src/utils/resourcesSectionInventory.ts:76-88`), so a section can appear
  offline and then fail to load. This path changed with the fluent-api
  cutover (PR #381) and PR #387, after #192 closed.
- **Source audio is streamed only.** `useSourceAudio` fetches the chapter's
  source audio from the API on every cache miss
  (`src/hooks/useSourceAudio.ts:172`); the response cache is in memory only
  (`:153-158`). Nothing reads a Tier 1 source audio
  file downloaded by Prepare for Offline.
- **App kill mid-download.** The queue row stays `downloading`. Auto-resume
  only picks up `queued`, `paused`, `cancelled` and `failed` rows
  (`src/services/downloadQueueAutoResume.ts:30-32`), even though
  `getResumableDownloadItems` returns `downloading` rows too
  (`src/db/downloadQueueRepository.ts:221-237`). Not reproduced on device
  (F.21 passed; see Not confirmed).
- **Connection loss mid-download.** A transfer error marks the item `failed`
  without saving new resume data (`src/db/downloadQueueRepository.ts:212-219`),
  then `processNext` immediately tries the next item
  (`src/services/downloadQueueWorker.ts:257-271`), so the rest of the queue
  can fail in a cascade. Failed items restart from zero unless an earlier
  pause saved resume data. #52 and #147 require partial progress to be kept.
  Not reproduced on device (F.20 passed; see Not confirmed).
- **Transport gate.** Download `start` has no Wi-Fi / cellular check
  (`src/hooks/useDownloadQueue.ts:243-268`). `resume` and auto-resume require
  Wi-Fi and ignore the cellular toggle (`src/hooks/useDownloadQueue.ts:284-293`,
  `src/services/downloadQueueAutoResume.ts:13`). Tracked in #546 (PR #559
  open). In-flight downloads never pause on transport change. #572 was closed
  without a fix (not requested), so no open issue covers that.
- **Auto-prompt.** The trigger also fires on cellular when the cellular toggle
  is on (`src/utils/prepareOfflineTrigger.ts:19-20`), while #39 says "On WiFi
  detection". It opens the project picker with no `projectId`
  (`src/app/screens/HomeScreen.tsx:220`) even though it evaluated a specific
  project. It depends on `getProjectsWithSummary`
  (`src/app/screens/HomeScreen.tsx:198`), which fails on large databases
  (#483), so the prompt may silently never appear.
- **Account scope.** `AuthSessionProvider` restarts auto-resume on account
  switch "so pending downloads cannot resume for the previous account"
  (`src/navigation/AuthSessionProvider.tsx:117`), but the resumable query has
  no user filter, so other accounts' rows are resumed too.
- **Offline cold start.** `useConnectivity` starts as online + Wi-Fi
  (`src/hooks/useConnectivity.ts:9-10`) until the first `/health` check
  resolves (up to 5 s), so the header can briefly show an online state.
- **Stage advancement offline** updates SQLite and skips the submit when the
  server is unreachable (`src/services/stageAdvance.ts:18-31`). No queue
  exists yet (#257). Reconnect behavior belongs to #530.
- **#51 QA (2026-08-25)** reported "Download button missing after chapter
  switch" and "Deselected resources still download". PR #436 fixed a
  re-download enqueue gate; the chapter-switch case was re-tested (C.13, still
  failing, Gap 5).

## Test Results

Scenario numbers match the device test script used for this audit
(section letter + step).

> **Pending PR #559 (#546, transport policy).** The run tests `main` without
> PR #559. That PR changes the behavior checked by **A.1–A.3** (prompt
> transport rule), **E.17–E.19** (download start/resume gate), **F.20**
> (auto-resume respects the cellular toggle), **G.22 / G.28** (link vs
> `/health` connectivity and Sync copy) and **G.31** (offline download
> start). If #559 merges before this audit closes, re-test those rows on the
> new `main` and record both results (before / after #559). E.18 and G.31
> failing on `d5b9e64` are Gap 6 (a comment on #546), not new issues. #559
> does not change Gaps 1–3, 5 and 7 or E.19's in-flight pause. If E.19 still
> fails after #559, no open issue covers it (#572 was closed without a fix:
> not requested), so it becomes a new gap under #146.

| # | Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| A.1 | Wi-Fi on, Home, project with no/`Rarely` profile | Prepare for Offline opens automatically (#39) | Sometimes opens, sometimes not, also in the isolated re-test | **Fail** → Gap 4 |
| A.2 | Dismiss (back) without downloading → reopen app on Wi-Fi | Prompt re-surfaces (#39) | Inconsistent (same as A.1) | **Fail** → Gap 4 |
| A.3 | Cellular only, toggle off → open app | No prompt (#39) | Reported as inconsistent together with A.1–A.4; whether it opened on cellular was not broken out | **Fail** → Gap 4 |
| A.4 | After Download started → reopen app on Wi-Fi | No prompt (#39) | Inconsistent (same as A.1) | **Fail** → Gap 4 |
| A.5 | Settings → Prepare for Offline | Opens regardless of prompt state (#39) | As expected | Pass |
| B.6 | Assigned translator: chapter accordion | Collapsed, "Assigned chapters (n)", assigned chapters pre-selected (#50) | As expected | Pass |
| B.7 | Unassigned project | Accordion open, nothing selected, Download disabled until a chapter is chosen (#50, #51) | Accordion **collapsed**, no chapter selected, Download **enabled** | **Fail** → Gap 3 |
| B.8 | Book "Select all" and chapter grid | Toggles all chapters of the book; 5-column grid; count updates live (#50) | As expected | Pass |
| C.9 | Resources to download | Grouped by name with Text/Audio sizes; Tier 1 locked; real resource names and sizes (#51, #504) | Tier 1 texts (Source Bible, Translation Notes) 26 KB, audio 17.1 MB: exactly 2 × the mock PDF (13,264 B) and 2 × the mock MP3 (8,945,229 B) | **Fail** → Gap 5 |
| C.10 | Customize download: deselect a Tier 2/3 item | Total and button label update; item not downloaded (#51) | As expected | Pass |
| C.11 | Download → Pause → Resume → finish | Controls swap; progress kept; rings then green checks (#52) | As expected | Pass |
| C.12 | Download → Cancel | Stops at once, no dialog, Download button returns (#52) | As expected | Pass |
| C.13 | After a completed download, select another chapter | Size updates and the Download button is available (#51 QA) | Size updates, but the footer shows "Download complete" instead of the button | **Fail** → Gap 5 |
| C.14 | Inspect downloaded files (debug build) | Real content for the project, not fixture files (epic mock rule) | After a completed online download, `files/downloads/464/` holds 13 fixture files: 6 × `.mp3` of 8,945,229 B, 6 × `.pdf` of 13,264 B, 1 × `.png` of 9,266 B (53,760,224 B, about 51 MiB), named `464-tier-N-<resource>-<kind>` | **Fail** → Gap 5 |
| D.15 | Manage Device Storage | Available + Fluent usage; other projects listed; empty state when none (#53) | As expected | Pass |
| D.16 | Delete selected (other project) | Live freed-space counter; confirm dialog copy; items removed (#53) | As expected | Pass |
| E.17 | Toggle "Upload/Download over cellular" in Settings | Sync page toggle mirrors it (#146) | As expected | Pass |
| E.18 | Cellular only, toggle off → tap Download | Download does not start; copy explains why (#146, #546) | Download is enabled. On tap (first entry, no earlier Pause), Pause + Cancel appear with no progress and no explanation for about 30 s. When Wi-Fi returns, the download continues on its own | **Fail** → Gap 6 |
| E.19 | Downloading on Wi-Fi → switch Wi-Fi off (cellular on, toggle off) | Download pauses (#146) | Inconsistent in the first run; to be re-evaluated after PR #559 (#546) merges | Blocked (pending #559) |
| F.20 | Downloading → airplane mode for 30 s → Wi-Fi back | Download stops, then resumes on Wi-Fi keeping partial progress (#52, #147) | As expected | Pass |
| F.21 | Downloading → kill app → relaunch on Wi-Fi | Download resumes, or offers Resume; no stuck progress (#201) | As expected | Pass |
| G.22 | Airplane mode | Header cloud gray `cloud-check` (nothing pending) / pending variant (#38) | As expected | Pass |
| G.23 | Airplane mode → kill → cold start | Still signed in; Home and My Work load (#291) | As expected | Pass |
| G.24 | Offline: Projects tab | Projects listed (#483) | As expected | Pass |
| G.25 | Offline: open a prepared chapter → Bible tab | Source text shows; source audio plays if downloaded (#51 Tier 1) | Source text shows; the source audio player shows only Retry | **Fail** → Gap 2 |
| G.26 | Offline: Resources tab on a prepared chapter | TN / TQ / Images show downloaded content with no network (#192) | No content; only "Unable to load" with Retry | **Fail** → Gap 1 |
| G.27 | Offline: Resources tab on an unprepared chapter | Sections shown as unavailable, no endless spinner (#192) | "No resources are on this device yet. Download them from Prepare for Offline."; the Bible tab audio shows Retry | Pass |
| G.28 | Offline: Sync page and Sync Now | Offline copy; Sync Now disabled with a reason | As expected | Pass |
| G.29 | Offline: switch account | Switch succeeds; the other account's local data loads (#87) | As expected | Pass |
| G.30 | Offline: advance a chapter stage | "Send to Peer Check" only on the last verse once every verse is recorded (#542, PR #550); stage updates locally at once (#258, #257) | Button shows only on the last verse with all verses recorded. After Send, the chapter leaves My Work; the Projects tab shows it at Peer Check | Pass (local update) → Gap 7 (My Work) |
| G.31 | Offline: open Prepare for Offline | Clear offline message; no crash (#51 edge cases) | Chapters and resources render (mock catalog). Download is enabled; tapping it shows Pause + Cancel with no message, and the log shows `DownloadQueueWorker` "Failed to download item" | **Fail** → Gap 6 |

## Offline and Synchronization Results

Going offline is this feature. Reconnect, upload and conflicts belong to the
sibling audits (#530, #533).

| Scenario | Result | Notes |
|---|---|---|
| Feature used while offline | Fail | G.22–G.24 and G.27–G.30 pass; prepared resources (G.26) and source audio (G.25) are not usable offline; Download offline gives no feedback (G.31); offline stage advance leaves My Work with no pending state (G.30, Gap 7) |
| App closed and reopened offline | Pass | G.23 |
| Device returns online | Pass | F.20 (download resume only); upload is #530 |
| Offline changes synchronize | N/A | Covered by #530 |
| Conflicting changes are handled | N/A | #256, #271 (open), sibling audits #530 and #533 |

## Gaps Identified

Existing issues were searched before routing (offline, prepare, download,
manifest, resources offline, source audio, cellular, queue, accordion, stage
advancement). Gaps 1–4 become new issues; Gaps 5–7 become comments on
existing open issues. Nothing is filed yet.

### Gap 1: Downloaded resources are not shown offline in the Resources tab

**Severity:** High (translators prepare for offline, then have no notes offline)  
**Launch blocker:** To be decided with product  
**Related issue:** [#192](https://github.com/eten-tech-foundation/fluent-mobile/issues/192) (closed), [#417](https://github.com/eten-tech-foundation/fluent-mobile/issues/417), [#504](https://github.com/eten-tech-foundation/fluent-mobile/issues/504)  
**Development task:** [tickets/resources-read-downloaded-content-offline.md](./tickets/resources-read-downloaded-content-offline.md)

**Description:**  
#192 requires prepared Resources content to be available with no network
calls. Translation Notes, Translation Questions and Images & Maps always load
from fluent-api, and the download inventory only gates which sections are
visible offline.

**Steps to reproduce:**

1. On Wi-Fi, prepare one chapter for offline (Settings → Prepare for Offline).
2. Turn on airplane mode, open that chapter, and open the Resources tab.

**Expected behavior:** downloaded TN / TQ / Images render offline.  
**Actual behavior:** "Unable to load" with Retry, and no content.  
**Evidence:** device run, G.26 (G.27, the unprepared case, passes).

### Gap 2: Source audio does not play offline after Prepare for Offline

**Severity:** High  
**Launch blocker:** To be decided with product  
**Related issue:** [#51](https://github.com/eten-tech-foundation/fluent-mobile/issues/51) (Tier 1 source audio), [#412](https://github.com/eten-tech-foundation/fluent-mobile/issues/412), [#504](https://github.com/eten-tech-foundation/fluent-mobile/issues/504)  
**Development task:** [tickets/source-audio-offline-playback.md](./tickets/source-audio-offline-playback.md)

**Description:**  
Source audio is Tier 1 and always part of the download (#51), but the Bible
tab player fetches it from fluent-api on every cache miss (in-memory cache
only, `src/hooks/useSourceAudio.ts:153-172`) and never reads a downloaded
file.

**Steps to reproduce:**

1. On Wi-Fi, prepare one chapter that has source audio.
2. Turn on airplane mode, open the chapter, and open the Bible tab.

**Expected behavior:** source audio plays offline.  
**Actual behavior:** the source text shows, but the player shows only Retry.  
**Evidence:** device run, G.25.

### Gap 3: Unassigned Prepare for Offline shows a collapsed accordion and an enabled Download

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#50](https://github.com/eten-tech-foundation/fluent-mobile/issues/50), [#51](https://github.com/eten-tech-foundation/fluent-mobile/issues/51), PR #341  
**Development task:** [tickets/unassigned-chapter-selection-state.md](./tickets/unassigned-chapter-selection-state.md)

**Description:**  
For a translator with no assigned chapters, the chapter accordion must open
by default and Download must stay disabled until a chapter is selected. The
device showed the opposite for both.

**Steps to reproduce:**

1. Sign in as a translator with no assigned chapters in a project.
2. Settings → Prepare for Offline → pick that project.

**Expected behavior:** accordion open; Download disabled with zero chapters.  
**Actual behavior:** accordion collapsed; Download enabled with zero chapters.  
**Evidence:** device run, B.7.

### Gap 4: The Prepare for Offline auto-prompt fires inconsistently

**Severity:** Medium (Settings → Prepare for Offline still works, A.5)  
**Launch blocker:** No  
**Related issue:** [#39](https://github.com/eten-tech-foundation/fluent-mobile/issues/39) (PR #242), [#483](https://github.com/eten-tech-foundation/fluent-mobile/issues/483), [#546](https://github.com/eten-tech-foundation/fluent-mobile/issues/546)  
**Development task:** [tickets/prepare-offline-auto-prompt-consistency.md](./tickets/prepare-offline-auto-prompt-consistency.md)

**Description:**  
The prompt only runs on specific events (foreground, Home regaining focus
with an eligible connection, sync completion) and returns early while Home
is "settling". The sync-complete handlers call it in the same tick in which
they clear the loading/syncing state, but `isSettlingRef` is only updated
later in an effect (`src/app/screens/HomeScreen.tsx:104-142`, `:179`), so
that evaluation can still see "settling" and nothing retries it. On the
device it opens intermittently in every #39 scenario, with no observable
pattern.

**Steps to reproduce:**

1. Clear app data, sign in on Wi-Fi with a single-project account, and wait
   on Home.
2. Background and return three times, then kill and reopen.

**Expected behavior:** the prompt follows the #39 rules every time.  
**Actual behavior:** it opens on some attempts and not on others.  
**Evidence:** device run, A.1–A.4 (first run and isolated re-test).

### Gap 5: Prepare for Offline downloads mock fixtures, and a new chapter shows "Download complete"

**Severity:** Medium (the fluent-api manifests exist; the fix is in progress)  
**Launch blocker:** No  
**Related issue:** [#504](https://github.com/eten-tech-foundation/fluent-mobile/issues/504) (open, PR #562 open), [#51](https://github.com/eten-tech-foundation/fluent-mobile/issues/51), [#446](https://github.com/eten-tech-foundation/fluent-mobile/issues/446)  
**Development task:** comment on #504 (existing open issue); no new issue

**Description:**  
Epic rule: mock data with a ready API is a gap. The catalog is
`MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST` and every item downloads a fixed
test PDF, MP3 or PNG (see Code Review Notes). The mock item ids have no
chapter (`src/utils/prepareOfflineResourceId.ts:7-14`), so a newly selected
chapter likely maps to queue rows that are already completed, and the footer
shows "Download complete". If enqueueing fails, a silent simulation shows progress
with nothing written to disk (`src/services/prepareOfflineDownload.ts:41-52`).

**Steps to reproduce:**

1. Prepare one chapter on Wi-Fi and wait for "Download complete".
2. Select another chapter in the same project.
3. On a debug build:
   `adb shell run-as com.eten.fluent ls -laR files/downloads/`.

**Expected behavior:** real resources with real sizes from the fluent-api
manifests (including Tier 1 source audio); Download is available for newly
selected chapters.  
**Actual behavior:** Tier 1 shows 26 KB of text and 17.1 MB of audio (2 ×
each fixture); disk holds 13 fixture files (about 51 MiB); a new chapter
shows "Download complete".  
**Evidence:** device run, C.9, C.13, C.14.

### Gap 6: Download "starts" with a blocked transport and gives no feedback

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#546](https://github.com/eten-tech-foundation/fluent-mobile/issues/546) (open, PR #559 open), [#146](https://github.com/eten-tech-foundation/fluent-mobile/issues/146)  
**Development task:** comment on #546 (existing open issue); no new issue

**Description:**  
Download `start` has no transport check
(`src/hooks/useDownloadQueue.ts:243-268`). On cellular with the toggle off,
and in airplane mode, Download is enabled and shows Pause + Cancel with no
progress and no explanation. #546 asks for one transport policy for upload
and download, with copy explaining why a transfer waits.

**Steps to reproduce:**

1. Turn Wi-Fi off (mobile data on, "Upload/Download over cellular" off), or
   turn on airplane mode.
2. Settings → Prepare for Offline → pick a project → Download.

**Expected behavior:** Download does not start, and the screen explains why.  
**Actual behavior:** Pause + Cancel with no progress. On cellular the
download continues when Wi-Fi returns (E.18). Offline, the items fail with
`DownloadQueueWorker` "Failed to download item" (G.31).  
**Evidence:** device run, E.18, G.31. Re-test after PR #559 merges.

### Gap 7: After an offline "Send to Peer Check", the chapter leaves My Work with no pending state

**Severity:** Low  
**Launch blocker:** No  
**Related issue:** [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) (open), [#258](https://github.com/eten-tech-foundation/fluent-mobile/issues/258), [#505](https://github.com/eten-tech-foundation/fluent-mobile/issues/505)  
**Development task:** comment on #257 (existing open issue); no new issue

**Description:**  
The local stage update works: the Projects tab shows the chapter at Peer
Check (`src/services/stageAdvance.ts:18-31`). But the chapter leaves the
translator's My Work at once. #258 says the row "transitions to the pending
upload sync state until the stage change syncs", and #257 defines that
pending indicator, so the translator has no sign that the change still needs
to sync.

**Steps to reproduce:**

1. In airplane mode, open a chapter with every verse recorded, go to the last
   verse, and tap "Send to Peer Check" → Send.
2. Open My Work, then the Projects tab.

**Expected behavior:** the chapter shows a pending-sync state until the
stage change syncs (product to confirm; see Open Questions).  
**Actual behavior:** the chapter disappears from My Work; Projects shows Peer
Check.  
**Evidence:** device run, G.30.

### Not confirmed (code-only)

- **Downloads orphaned by an app kill** (`downloadQueueAutoResume.ts:30-32`)
  and **connection loss failing the queue without resume data**
  (`downloadQueueWorker.ts:257-271`): F.20 and F.21 passed on device, so these
  stay Code Review Notes with no ticket or issue.
- **Images & Maps hidden offline** (#417): G.26 only showed "Unable to load"
  with Retry; hiding Images & Maps was not observed separately. #417 stays
  a related issue of Gap 1.

## Open Questions

- #39 says the prompt fires "On WiFi detection", but the trigger also fires on
  cellular when "Upload/Download over cellular" is on. Is that intended?
- With several qualifying projects, the prompt opens the project picker rather
  than the project that triggered it (#39 open question 2). Is the picker the
  intended landing?
- After Cancel, the download-started flag stays set, so the prompt never
  re-surfaces (#52 open question 1). Confirm with product.
- Is `connectivityProfile` populated in project metadata by fluent-api for the
  test projects? If not, every project behaves as `Rarely Connected`.
- After an offline "Send to Peer Check", the chapter leaves the translator's
  My Work at once (G.30). #258 says the row "transitions to the pending
  upload sync state until the stage change syncs" and only describes removal
  for Peer Check → Community Review. Should the drafted chapter stay in My
  Work with a pending indicator until it syncs (#257, #505)? This decides
  Gap 7's AC.
- #508 (Observer offline download) is open and not built. Is it in scope for
  the November 2026 launch?

## Audit Summary

**Overall result:** Pass with gaps

**Summary:**  
On a physical Android 10 device, the Prepare for Offline mechanics work:
Settings entry, assigned chapter selection, Customize download,
Pause / Resume / Cancel, resume after connection loss or an app kill, device
storage management, and the cellular toggle mirror. The core offline session
also works: offline cold start, the gray header state, Home, My Work,
Projects, the Sync page, account switching, and local stage advancement.

The main risk is that **preparing for offline does not make content usable
offline**. Downloads are still mock fixtures (Gap 5, #504), and even the
downloaded files are never read: Resources (Gap 1) and source audio (Gap 2)
always call the API, so a prepared chapter has no notes and no source audio in
airplane mode. Both are High and should be decided on as launch blockers
before the November 2026 ETEN Summit. The auto-prompt is unreliable (Gap 4),
the unassigned chapter selection state is wrong (Gap 3), downloads start
with a blocked transport and no feedback (Gap 6, #546 / PR #559), and an
offline stage advance leaves My Work with no pending state (Gap 7, #257).

The first run used the release nightly of `main` @ `d5b9e64`. C.14 and G.31
used a local debug build of the same commit.

**Follow-up required:**

- [ ] All identified gaps have corresponding GitHub issues.
- [ ] Mobile and API dependencies are cross-linked. _(the fluent-api
      manifests already exist; mobile wiring is #504 / PR #562; no new API
      work found)_
- [ ] Launch-blocking gaps are clearly identified.
- [ ] If PR #559 merged during the audit: A.1–A.3, E.17–E.19, F.20, G.22,
      G.28 and G.31 re-tested on the new `main` and both results recorded.
- [ ] Assessment has been reviewed and merged.

**Merged assessment:** ⏳
