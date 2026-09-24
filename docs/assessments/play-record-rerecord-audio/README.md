# Play, Record, and Re-record Audio Audit

> **Status: device run complete; gaps filed.** Gaps 1–3, 5 and 6 are filed
> as #567–#571 (sub-issues of #528). Gap 4 was added to the open #544.

## Overview

**Feature:** Record tab draft capture and review — record, pause/resume, stop,
multi-take list, take playback, scrubbing, select/delete, All Takes /
canonical, verse vs pericope capture  
**Auditor:** Jonathan Seehagen (`@JonathanSeehagen`)  
**Date tested:** 2026-09-23  
**Build/version:** Local run of merged `main` @ `d5b9e64` (`expo-dev-client` + Metro), not a distributed build or the nightly APK  
**Environment:** `https://dev.api.fluent.bible`  
**Device and OS:** Xiaomi Redmi Note 9 Pro, Android 10 (API 29), physical device  
**Audit sub-issue:** [#528](https://github.com/eten-tech-foundation/fluent-mobile/issues/528) (epic [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526))

## Related Issues

Product specs (source of expected behavior):

- [#49](https://github.com/eten-tech-foundation/fluent-mobile/issues/49) — Build Record Tab with Draft Recording and Playback (Closed)
- [#71](https://github.com/eten-tech-foundation/fluent-mobile/issues/71) — Add Multi-Take Recording to Record Tab (Closed; replaces #49 silent re-record with "Record New Take")
- [#279](https://github.com/eten-tech-foundation/fluent-mobile/issues/279) — All-Takes View with Canonical Selection (Closed)
- [#404](https://github.com/eten-tech-foundation/fluent-mobile/issues/404) — Record tab scrolls as one page (Closed)
- [#409](https://github.com/eten-tech-foundation/fluent-mobile/issues/409) — Record tab for Verse/Pericope toggle (Closed)
- [#410](https://github.com/eten-tech-foundation/fluent-mobile/issues/410) — Mixed-mode recording + cross-granularity take labels (Open)
- [#411](https://github.com/eten-tech-foundation/fluent-mobile/issues/411) — Cross-granularity playback with stitching (Open)

Engineering / engine:

- [#23](https://github.com/eten-tech-foundation/fluent-mobile/issues/23) — Audio recording (Closed)
- [#95](https://github.com/eten-tech-foundation/fluent-mobile/issues/95) — Recording engine on expo-audio (Closed)
- [#96](https://github.com/eten-tech-foundation/fluent-mobile/issues/96) — Playback engine on expo-audio + waveform decision (Closed)
- [#98](https://github.com/eten-tech-foundation/fluent-mobile/issues/98) — Multi-take `take_number` / selection semantics (Closed)
- [#170](https://github.com/eten-tech-foundation/fluent-mobile/issues/170) — Clear orphaned paused takes (Closed)
- [#176](https://github.com/eten-tech-foundation/fluent-mobile/issues/176) / [#233](https://github.com/eten-tech-foundation/fluent-mobile/issues/233) — Seekable playback (AAC→M4A remux) (Closed)

Bug fixes and regressions:

- [#236](https://github.com/eten-tech-foundation/fluent-mobile/issues/236) — Blank Record tab, mic release, playback stuck at 0:00 (Closed)
- [#298](https://github.com/eten-tech-foundation/fluent-mobile/issues/298) — Multi-take "Maximum update depth" on device (Closed)
- [#474](https://github.com/eten-tech-foundation/fluent-mobile/issues/474) — Pericope take subtitle truncation (Closed)
- [#485](https://github.com/eten-tech-foundation/fluent-mobile/issues/485) — Waveform shifts left when recording starts (Closed)
- [#486](https://github.com/eten-tech-foundation/fluent-mobile/issues/486) — Audio error resuming after pause / screen lock (Closed)
- [#544](https://github.com/eten-tech-foundation/fluent-mobile/issues/544) — Waveform scrubbing restarts instead of seeking (Open)
- [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564) — Bible unit tap no longer opens Record (Open; from #527 audit)

Adjacent (owned by sibling audits, listed for cross-reference):

- [#256](https://github.com/eten-tech-foundation/fluent-mobile/issues/256) — Conflict detection for offline takes (Open)
- [#269](https://github.com/eten-tech-foundation/fluent-mobile/issues/269) — Recording warning on taken chapters (Open)
- [#268](https://github.com/eten-tech-foundation/fluent-mobile/issues/268) / [#270](https://github.com/eten-tech-foundation/fluent-mobile/issues/270) — Online/offline chapter claiming on first recording (Closed)
- [#493](https://github.com/eten-tech-foundation/fluent-mobile/issues/493) — Maestro Record happy-path smoke (Closed)

## Expected Behavior

Consolidated from the specs above. Where a later ticket supersedes an earlier
one, the later ticket wins.

- **Idle:** with no take for the unit, show an enlarged Record button labeled
  "Record <reference>" and no waveform (#49).
- **Mic permission:** request on first record. If denied, explain and offer
  "Go to Settings" (#49).
- **Recording:** live waveform, Pause and Stop controls, and a real-time
  duration counter (#49). The waveform stays centered (#485).
- **Pause/Resume:** Pause halts capture and Resume appends to the same take,
  including after a screen lock (#49, #486).
- **Background / kill:** backgrounding the app auto-pauses. A paused partial
  take is flushed to disk and recoverable after an app kill, and paused takes
  never time out (#49).
- **Leaving during capture:** changing verse, changing tab, pressing back,
  opening Sync, or switching account while recording or paused must be
  intercepted. #49 specifies a **resume or discard** prompt.
- **Stop:** commits the take, auto-selects it as the active draft, and does
  not auto-advance the verse (#49, #71).
- **Multi-take:** compact take cards (number, waveform, duration,
  play/pause, selection). Playback is exclusive: playing one take stops any
  other. "Record New Take" replaces Re-record. Takes are capped at 5 per unit
  per account (#71, #279).
- **Delete:** a non-selected take is deleted immediately. The selected take
  asks for confirmation, then the next take is selected. Deleting the last
  take returns to Idle. Take numbering is cumulative (#71).
- **Review playback:** Play from the scrub position. At the end, playback
  stops and resets. Tapping the waveform seeks to that position (#49, #176,
  #544).
- **All Takes:** a toggle appears only when another account has takes for
  the unit, and it defaults to My Takes. All Takes groups takes by account,
  offers only play and canonical designation, and allows a single canonical
  take (#279).
- **Verse / pericope:** the title shows a verse reference or a pericope range
  with a subtitle. Verse-mode waveforms have tick marks; pericope mode has a
  continuous scrubber (#409). Takes are labeled by the granularity they were
  recorded in (#410). Verse takes are stitched for pericope playback (#411).
- **Layout:** the verse nav stays pinned and the take list and source text
  scroll as one page (#404).

## Code Review Notes (pre-device)

Read on `main` @ `d5b9e64`:

- Mock data: none. The Record tab and engines use real `expo-audio`, SQLite
  (`recordingsRepository`) and on-device files. The only placeholder is the
  intentionally disabled Idle play button (`record-play-idle-placeholder`),
  which matches the design.
- The capture preset is `RecordingPresets.HIGH_QUALITY` (`.m4a`) in
  `src/hooks/useRecordingEngine.ts`, not the ADTS `.aac` that #176
  describes. Commit therefore passes through `ensureSeekableTakeUri`
  unchanged, and the AAC→M4A remux (#233) is effectively unused.
- Kill-safe recovery is not on `main`. `upsertPausedTake`
  (`src/services/pausedTakes.ts`) is never called and there is no recovery
  prompt. The original implementation (`useRecordingRecovery`, PR #158)
  was closed unmerged when the Record tab was rebuilt in thin PRs. Only the
  #170 cleanup paths remain (launch and Settings → Clear cache).
- There is no background auto-pause. `useRecordingEngine` listens only for
  `AppState` → `active`, to re-sync native paused state for #486. Nothing
  pauses the take on `background`.
- The leave guards (`DraftingScreen.tsx`, `RecordTab.tsx`
  `requestVerseChange`) show an OK-only "Recording in progress" alert with
  no Resume or Discard choice. No discard path exists in `useVerseAudio`:
  Stop is the only way out, and it always commits.
- `verseAudioReducer` only accepts `PLAY` from `recorded`. After any error
  moves the machine to `error`, a take plays but the card never shows
  Pause, and the natural-end handler never fires. The state only recovers
  after a verse change, a delete, or a new recording.

## Test Results

Scenario numbers match the device test script used for this audit
(section letter + step).

| # | Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| A.1 | Mic denied → tap Record | Explanation + "Go to Settings" deep link | As expected | Pass |
| A.2 | Mic allowed → Record; Idle state | Enlarged "Record <ref>", no waveform; capture starts | As expected | Pass |
| B.3 | Recording chrome | Counter increments; waveform centered (#485); Pause + Stop | As expected | Pass |
| B.4 | Pause → wait 10s → Resume | Appends to same take, no audio error (#486) | As expected | Pass |
| B.5 | Pause → lock → unlock → Resume | Appends, no audio error (#486) | As expected | Pass |
| B.6 | Recording → Home (background) → return | Take auto-paused (#49) | Recording does **not** pause | **Fail** → Gap 1 |
| B.7a | Paused → prev/next, tab, back, Sync, account | Leave intercepted with a Resume/Discard prompt (#49) | Leave is blocked, but only by a "Recording in progress" alert with a single OK button | **Fail** → Gap 6 |
| B.7b | Paused → swipe open drawer → Settings → Home | Leave intercepted | Drawer opens and navigates away; on return the in-progress take is gone | **Fail** → Gap 2 |
| B.8 | Stop | Take 1 listed + selected; no auto-advance | As expected | Pass |
| C.9–10 | Play to end / pause mid-take | Pause icon while playing; real duration; resets at end | As expected | Pass |
| C.11 | Tap waveform mid-take | Seeks to tapped position (#544) | Seeks to the position, but playback auto-starts and the control stays **Play**. Also raises `Maximum update depth exceeded` | **Fail** → Gaps 3, 4 |
| D.12 | Record New Take | List collapses; new take appended + selected | As expected | Pass |
| D.13 | Alternate Take 1 / Take 2 playback ×5 | Exclusive playback; no update-depth error (#298) | Exclusive playback OK; switching takes raises `Maximum update depth exceeded` (dev LogBox, no functional UI error) | **Fail** → Gap 3 |
| D.14 | Select an older take | One selected | As expected | Pass |
| D.15 | Delete non-selected take | Immediate, no prompt | As expected | Pass |
| D.16 | Delete selected take | Confirm → next take selected | As expected | Pass |
| D.17 | Take numbering after delete | Cumulative | As expected | Pass |
| D.18 | 5 takes recorded | "Record New Take" disabled | As expected | Pass |
| D.19 | Many takes + Source Text | Single page scroll; nav pinned (#404) | As expected | Pass |
| D.20 | Delete last take | Returns to Idle | As expected | Pass |
| E.21–22 | Paused → kill app → relaunch | Partial take recoverable (#49) | Take lost; the verse comes back with no takes and no recovery prompt | **Fail** → Gap 1 |
| F.23 | Account B opens verse recorded by account A | Toggle shown, defaults to My Takes (#279) | Toggle shown; My Takes empty with the Record button visible | Pass |
| F.24–26 | All Takes grouping + canonical | Grouped by account; single canonical | As expected | Pass |
| G.27 | Pericope capture | Range title + subtitle; "Pericope" take label (#409/#410) | As expected | Pass |
| G.28 | Stitched row playback (#411) | Verse takes play in order | Plays correctly; stitched row waveform sits further right than the pericope row (no delete icon) | **Fail (cosmetic)** → Gap 5 |
| H.29 | Source audio playing → Record | Source audio stops before capture | As expected | Pass |
| J.32 | Audio error → play another take | Pause icon while playing | No audio error occurred during the run, so this could not be triggered | Blocked |

## Offline and Synchronization Results

Record and playback are local-first. Upload, sync and conflicts belong to the
sibling audits (#529, #530); only local behavior is checked here.

| Scenario | Result | Notes |
|---|---|---|
| Feature used while offline | Pass | I.30 — record, play, select, delete in airplane mode |
| App closed and reopened offline | Pass | I.31 — takes still listed and playable |
| Device returns online | N/A | Covered by #530 |
| Offline changes synchronize | N/A | Covered by #530 |
| Conflicting changes are handled | N/A | #256 (open), sibling audits |

## Gaps Identified

Searched for existing issues before filing (kill, recover, background,
discard, paused take, drawer, maximum update depth, scrub, seek, stitched).

### Gap 1: No background auto-pause or kill-safe recovery for in-progress takes

**Severity:** High (in-progress recordings are lost)  
**Launch blocker:** To be decided with product  
**Related issue:** [#49](https://github.com/eten-tech-foundation/fluent-mobile/issues/49), [#170](https://github.com/eten-tech-foundation/fluent-mobile/issues/170), [#176](https://github.com/eten-tech-foundation/fluent-mobile/issues/176)  
**Development task:** [#567](https://github.com/eten-tech-foundation/fluent-mobile/issues/567)

**Description:**  
#49 requires two things. First, backgrounding the app auto-pauses the take.
Second, a paused partial take is flushed to disk and can be recovered after
an app kill. On `main`, nothing pauses on background and nothing writes
paused-take markers (`upsertPausedTake` has no callers). Captures are
`.m4a` (HIGH_QUALITY), which is not playable if the process dies before
`stop()`.

**Steps to reproduce:**

1. Record a verse and press Home. On return, recording is still running (B.6).
2. Record a verse and pause after about 10 s.
3. Swipe the app away from Recents, then relaunch it.

**Expected behavior:** backgrounding auto-pauses, and after relaunch a
recovery prompt offers to resume or discard the partial take.  
**Actual behavior:** recording continues in the background, and after a kill
the take is lost; the verse comes back with no takes.  
**Evidence:** device run, B.6 and E.22.

### Gap 2: Drawer navigation bypasses the recording leave guard and discards the take

**Severity:** High (silent data loss)  
**Launch blocker:** To be decided with product  
**Related issue:** [#49](https://github.com/eten-tech-foundation/fluent-mobile/issues/49), [#47](https://github.com/eten-tech-foundation/fluent-mobile/issues/47)  
**Development task:** [#568](https://github.com/eten-tech-foundation/fluent-mobile/issues/568)

**Description:**  
The drafting screen guards tab changes, header or system back, Sync, and
account switching while a take is recording or paused. The root drawer
(`src/routes/(app)/_layout.tsx`, `swipeEnabled: true`) is not guarded, so a
translator can open it and go to Settings, then Home. When the drafting
screen unmounts (Settings returns Home via `router.replace(hrefs.home())`), `useRecordingEngine` stops the recorder without persisting
the capture, and the take is discarded with no prompt. The same drawer
also offers account switch (`resetNavigationAfterAccountSwitch` →
`router.dismissAll()`), Add User, and Sign Out, and each of those also
bypasses the drafting guards.

**Steps to reproduce:**

1. On the Record tab, record, then pause.
2. Swipe from the left edge to open the drawer, go to Settings, then back to Home.
3. Reopen the verse: the in-progress take is gone.

**Expected behavior:** the drawer is disabled, or intercepted with the same
guard, while a take is recording or paused.  
**Actual behavior:** the app navigates away and the take is lost.  
**Evidence:** device run, B.7b.

### Gap 3: "Maximum update depth exceeded" during take playback (regression of #298)

**Severity:** Medium (no visible UI error, but #298 reported slowdowns until
reload)  
**Launch blocker:** No  
**Related issue:** [#298](https://github.com/eten-tech-foundation/fluent-mobile/issues/298) (closed), [#411](https://github.com/eten-tech-foundation/fluent-mobile/issues/411)  
**Development task:** [#569](https://github.com/eten-tech-foundation/fluent-mobile/issues/569)

**Description:**  
React's `Maximum update depth exceeded` is raised when switching playback
from one take to another (D.13) and when tapping the middle of a take's
waveform to play from there (C.11). #298 fixed this path
in August. Later changes to the playback and take-load effects (for example
the #411 stitching and `REHYDRATE` loop fixes in `RecordTab.tsx` and
`useVerseAudio.ts`) are the likely re-entry points.

**Steps to reproduce:**

1. Record Take 1 and Take 2 on a verse.
2. Play Take 1, then switch to Take 2 (or tap the middle of a take's
   waveform).
3. Watch the dev LogBox or Metro logs.

**Expected behavior:** no update-depth error.  
**Actual behavior:** `Maximum update depth exceeded` is logged.  
**Evidence:** device run, C.11 and D.13 (dev build LogBox).

### Gap 4: Waveform tap auto-plays and the control stays on Play

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#544](https://github.com/eten-tech-foundation/fluent-mobile/issues/544) (open, same interaction), [#176](https://github.com/eten-tech-foundation/fluent-mobile/issues/176); source-audio scrub on the Bible tab reported separately in [#408 QA](https://github.com/eten-tech-foundation/fluent-mobile/issues/408#issuecomment-5728779028)  
**Development task:** [#544 comment](https://github.com/eten-tech-foundation/fluent-mobile/issues/544#issuecomment-5799518492) (existing open issue); no new issue

**Description:**  
Tapping the draft waveform now seeks to the tapped position, but playback
starts on its own and the take control keeps showing **Play**. In
`useVerseAudio.seek`, `playingTakeId` is set but no `PLAY` is dispatched,
so the card's `isThisPlaying` (which requires `state === 'playing'`) stays
false.

**Steps to reproduce:**

1. Record a take, then tap the middle of its waveform.

**Expected behavior:** seek to the position, and the control reflects the
real playback state.  
**Actual behavior:** audio plays from the position while the control shows
Play.  
**Evidence:** device run, C.11.

### Gap 5: Stitched take row waveform misaligned with pericope take rows

**Severity:** Low (cosmetic)  
**Launch blocker:** No  
**Related issue:** [#411](https://github.com/eten-tech-foundation/fluent-mobile/issues/411) (merged in PR #506, passed QA), [#474](https://github.com/eten-tech-foundation/fluent-mobile/issues/474)  
**Development task:** [#571](https://github.com/eten-tech-foundation/fluent-mobile/issues/571)

**Description:**  
In pericope view, the stitched row's waveform sits further right than a
pericope take row's waveform. Stitched rows cannot be deleted, so they
render without the trailing delete icon. The waveform then takes that space
and the two rows no longer line up.

**Steps to reproduce:**

1. Record verse takes and a pericope take in the same pericope.
2. Open pericope view and compare the waveform position of the two rows.

**Expected behavior:** the waveforms line up across rows (reserve the
trailing slot).  
**Actual behavior:** the stitched waveform is offset.  
**Evidence:** device run, G.28 (screenshot attached on #571).

### Gap 6: Leaving during capture offers no Resume or Discard option

**Severity:** Low / Medium  
**Launch blocker:** No  
**Related issue:** [#49](https://github.com/eten-tech-foundation/fluent-mobile/issues/49)  
**Development task:** [#570](https://github.com/eten-tech-foundation/fluent-mobile/issues/570)

**Description:**  
#49 specifies a resume-or-discard prompt when a translator navigates away
from a paused take. The app blocks the navigation, but only with a
"Recording in progress" alert that has a single OK button. There is no
discard path: Stop is the only exit, and it always commits a take that
counts toward the 5-take cap.

**Steps to reproduce:**

1. Record, then pause.
2. Tap the next-verse chevron, another tab, back, Sync, or the account
   switcher.

**Expected behavior:** a prompt with Resume and Discard (product to confirm
the copy).  
**Actual behavior:** an alert with OK only.  
**Evidence:** device run, B.7a.

### Not confirmed (code-only)

- **Playback controls stuck after an audio error:** see the `verseAudioReducer`
  bullet in Code Review Notes (pre-device). No audio error occurred during the device run (J.32),
  so this stays a code-review finding with no ticket or issue.

### Already tracked (no new issue)

- Bible unit tap does not open Record — [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564) (open, from #527).

## Open Questions

- #410 and #411 are open, but their behavior (granularity subtitles,
  stitched rows) is already in `RecordTab.tsx`. #411 was merged in PR #506
  and passed QA, so it is only waiting to be closed. Is #410 in the same
  state?
- #269 is open, but `record-taken-warning` and `record-conflict-warning`
  banners already render. Same question.
- #176 describes ADTS `.aac` capture for kill safety, but `main` records
  `.m4a`. Was switching the capture format an intentional decision? It
  affects the fix for Gap 1.
- #49 says Re-record overwrites silently; #71 replaced it with "Record New
  Take". Confirm that "re-record" in this audit's scope means "Record New
  Take".

## Audit Summary

**Overall result:** Pass with gaps

**Summary:**  
The core flows work on a physical Android 10 device: record, pause, resume
(including after a screen lock), stop, multi-take playback, select, delete,
the 5-take cap, All Takes and canonical, pericope capture and stitching, and
offline use. The main risk is **losing in-progress recordings**: there is no
background auto-pause and no kill-safe recovery (Gap 1), and the drawer lets
a translator leave mid-take, which silently discards it (Gap 2). Both
should be decided on as launch blockers before the November 2026 ETEN
Summit. The #298 update-depth error has regressed (Gap 3). The rest are
medium or low playback and UI issues (Gaps 4–6).

The device run used a local run of merged `main` over Metro, not the nightly APK.
The update-depth error was observed through the dev LogBox.

**Follow-up required:**

- [x] All identified gaps have corresponding GitHub issues. _(#567–#571; #544 updated)_
- [x] Mobile and API dependencies are cross-linked. _(none: local-only feature, no API gaps)_
- [ ] Launch-blocking gaps are clearly identified.
- [ ] Assessment has been reviewed and merged.

**Merged assessment:** ⏳
