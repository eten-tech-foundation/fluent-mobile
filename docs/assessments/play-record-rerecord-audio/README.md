# Play, Record, and Re-record Audio Audit

> **Status: draft — device run pending.** Code review and issue history are
> complete. Rows marked ⏳ still need to be run on an Android device, and the
> "Candidate" gaps below must be confirmed on device before GitHub issues are
> filed.

## Overview

**Feature:** Record tab draft capture and review — record, pause/resume, stop,
multi-take list, take playback, scrubbing, select/delete, All Takes /
canonical, verse vs pericope capture  
**Auditor:** Jonathan Seehagen (`@JonathanSeehagen`)  
**Date tested:** ⏳  
**Build/version:** ⏳ (nightly APK build number / commit)  
**Environment:** ⏳ (`https://dev.api.fluent.bible` or other)  
**Device and OS:** ⏳ (physical device model + Android version)  
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

| Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|
| First record → mic prompt → allow | OS dialog; recording starts | ⏳ | ⏳ |
| Mic denied / permanently denied | Explanation + "Go to Settings" deep link | ⏳ | ⏳ |
| Idle state | Enlarged Record "Record <ref>", no waveform | ⏳ | ⏳ |
| Record → timer + waveform | Counter increments; waveform centered (#485) | ⏳ | ⏳ |
| Pause → wait 10s → Resume | Appends to same take, no audio error (#486) | ⏳ | ⏳ |
| Pause → lock screen → unlock → Resume | Appends, no audio error (#486) | ⏳ | ⏳ |
| Recording → press Home (background) → return | Take auto-paused (#49) | ⏳ | ⏳ |
| Recording/paused → swipe app away (kill) → relaunch | Partial take recoverable (#49) | ⏳ | ⏳ |
| Paused → prev/next verse | Resume or discard prompt (#49) | ⏳ | ⏳ |
| Paused → tab / back / Sync / account | Leave blocked with prompt | ⏳ | ⏳ |
| Stop | Take 1 listed + selected; verse does not advance | ⏳ | ⏳ |
| Play take → plays to end | Pause icon while playing; resets at end | ⏳ | ⏳ |
| Duration shown | Real duration, advancing time (#236) | ⏳ | ⏳ |
| Record Take 2, play Take 1 then Take 2 | Exclusive playback; no update-depth crash (#298) | ⏳ | ⏳ |
| Tap waveform mid-take | Seeks to tapped position (#544) | ⏳ | ⏳ |
| Select an older take | Selection indicator moves; one selected | ⏳ | ⏳ |
| Delete non-selected take | Removed immediately, no prompt | ⏳ | ⏳ |
| Delete selected take | Confirm → next take selected | ⏳ | ⏳ |
| Delete last take | Returns to Idle | ⏳ | ⏳ |
| Take numbering after delete | Cumulative (no reuse) | ⏳ | ⏳ |
| 5 takes recorded | "Record New Take" disabled | ⏳ | ⏳ |
| Force an audio error, then play a take | Card shows Pause while playing | ⏳ | ⏳ |
| Many takes + open Source Text | Single page scroll; nav pinned (#404) | ⏳ | ⏳ |
| Second account records same verse | Toggle appears; All Takes grouped by account (#279) | ⏳ | ⏳ |
| All Takes: designate canonical | Single canonical across accounts | ⏳ | ⏳ |
| Pericope mode: record | Title = range + subtitle; take labeled Pericope (#409/#410) | ⏳ | ⏳ |
| Pericope mode with verse takes | Stitched row plays verses in order (#411) | ⏳ | ⏳ |
| Source audio playing → start recording | Source audio stops before capture | ⏳ | ⏳ |

## Offline and Synchronization Results

Record and playback are local-first. Upload, sync and conflicts belong to the
sibling audits (#529, #530); only local behavior is checked here.

| Scenario | Result | Notes |
|---|---|---|
| Feature used while offline | ⏳ | Record, play, select and delete in airplane mode |
| App closed and reopened offline | ⏳ | Takes still listed and playable |
| Device returns online | N/A | Covered by #530 |
| Offline changes synchronize | N/A | Covered by #530 |
| Conflicting changes are handled | N/A | #256 (open), sibling audits |

## Gaps Identified

> Candidates from code review. Each needs device confirmation before an issue
> is filed. No open issue covers them today (searched: kill, recover,
> background, discard, paused take).

### Candidate: No kill-safe recovery or background auto-pause for in-progress takes

**Severity:** High (data loss of in-progress recordings)  
**Launch blocker:** To be decided with product  
**Related issue:** [#49](https://github.com/eten-tech-foundation/fluent-mobile/issues/49), [#170](https://github.com/eten-tech-foundation/fluent-mobile/issues/170), [#176](https://github.com/eten-tech-foundation/fluent-mobile/issues/176)  
**Development task:** [tickets/restore-kill-safe-paused-take-recovery.md](./tickets/restore-kill-safe-paused-take-recovery.md) · issue ⏳

**Description:**  
#49 requires that pausing flushes the partial take to disk and that the take
can be recovered after the app is killed, and that backgrounding auto-pauses.
On `main`, nothing writes paused-take markers and nothing pauses on
background. Captures are `.m4a` (HIGH_QUALITY), which is not playable if the
process dies before `stop()`.

**Steps to reproduce:**

1. Record a verse and pause after about 10 s.
2. Swipe the app away from Recents.
3. Relaunch and return to the verse.

**Expected behavior:** a recovery prompt resumes or discards the partial take.  
**Actual behavior:** ⏳ (code suggests the take is lost silently).  
**Evidence:** ⏳

### Candidate: Leaving during capture offers no Resume or Discard option

**Severity:** Low / Medium  
**Launch blocker:** No  
**Related issue:** [#49](https://github.com/eten-tech-foundation/fluent-mobile/issues/49)  
**Development task:** [tickets/paused-take-resume-or-discard-prompt.md](./tickets/paused-take-resume-or-discard-prompt.md) · issue ⏳

**Description:**  
#49 specifies a resume-or-discard prompt when navigating away from a paused
take. The app shows an OK-only "Recording in progress" alert. The only
exit is Stop, which always commits the take and counts it toward the
5-take cap.

**Steps to reproduce:**

1. Record, then pause.
2. Tap the next-verse chevron or the back button.

**Expected behavior:** a prompt to resume or discard.  
**Actual behavior:** ⏳ (code: an "OK" alert only).  
**Evidence:** ⏳

### Candidate: Take playback controls stuck after an audio error

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#96](https://github.com/eten-tech-foundation/fluent-mobile/issues/96), [#298](https://github.com/eten-tech-foundation/fluent-mobile/issues/298)  
**Development task:** [tickets/playback-controls-after-audio-error.md](./tickets/playback-controls-after-audio-error.md) · issue ⏳

**Description:**  
`verseAudioReducer` ignores `PLAY` unless the state is `recorded`. Once any
audio error moves the machine to `error`, playing a take starts the audio,
but the card keeps showing Play (not Pause) and the natural end is not
processed. The state recovers only after a verse change, a delete (which
dispatches `REHYDRATE` when other takes remain, or `DELETE` for the last
take), or a new recording.

**Steps to reproduce:**

1. Trigger any audio error. For example, play a take whose file was removed
   (`adb run-as`, which needs a debuggable `development` build), or hit a
   resume error.
2. Dismiss the alert and tap Play on another take.

**Expected behavior:** the card shows Pause while playing, and resets at the
end.  
**Actual behavior:** ⏳  
**Evidence:** ⏳

### Already tracked (no new issue)

- Waveform tap restarts instead of seeking — [#544](https://github.com/eten-tech-foundation/fluent-mobile/issues/544) (open).
- Bible unit tap does not open Record — [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564) (open, from #527).

## Open Questions

- #410 and #411 are open, but their behavior (granularity subtitles,
  stitched rows) is already in `RecordTab.tsx`. Are they waiting on QA, or
  is scope still missing?
- #269 is open, but `record-taken-warning` and `record-conflict-warning`
  banners already render. Same question.
- #176 describes ADTS `.aac` capture for kill safety, but `main` records
  `.m4a`. Was switching the capture format an intentional decision? It
  affects the fix for the first gap.
- #49 says Re-record overwrites silently; #71 replaced it with "Record New
  Take". Confirm that "re-record" in this audit's scope means "Record New
  Take".

## Audit Summary

**Overall result:** ⏳ (expected: Pass with gaps)

**Summary:**  
⏳ — fill after the device run.

**Follow-up required:**

- [ ] All identified gaps have corresponding GitHub issues.
- [ ] Mobile and API dependencies are cross-linked. _(none expected; local-only feature)_
- [ ] Launch-blocking gaps are clearly identified.
- [ ] Assessment has been reviewed and merged.

**Merged assessment:** ⏳
