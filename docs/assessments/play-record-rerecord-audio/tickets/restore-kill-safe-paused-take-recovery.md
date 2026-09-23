# Restore kill-safe recovery and background auto-pause for in-progress takes

> Confirmed on device (#528 audit, B.6 and E.22).

**GitHub issue:** #567

## Summary

#49 requires that a paused take is flushed to disk and can be recovered after
an app kill, and that backgrounding the app during recording auto-pauses the
take. The original implementation (PR #158, `useRecordingRecovery`) was closed
unmerged when the Record tab was rebuilt. On `main`:

- `upsertPausedTake` (`src/services/pausedTakes.ts`) has no callers, and no
  recovery prompt exists. Only the #170 cleanup paths remain.
- `useRecordingEngine` handles only `AppState` → `active` (#486). Nothing
  pauses the take on `background`.
- Capture uses `RecordingPresets.HIGH_QUALITY` (`.m4a`). The file is not
  valid until `stop()` writes the `moov` atom, so a killed process leaves no
  playable partial take.

## Expected

- Backgrounding the app during recording auto-pauses the take, the same as a
  manual Pause.
- A paused or killed take survives an app kill. On return, the translator is
  offered Resume or Discard for that verse.
- Paused takes have no timeout.

## Actual

- B.6: pressing Home during recording does **not** pause the take.
- E.22: after pause, kill, and relaunch, the take is lost; the verse comes
  back with no takes and no recovery prompt.

## Steps to reproduce

1. Open a verse on the Record tab, record for about 10 s, then tap Pause.
2. Swipe the app away from Recents.
3. Relaunch the app and open the same verse.
4. Observe: no recovery prompt, and no partial take.

Background variant (B.6): while recording, press Home for 30 s, then
return. Recording is still running and has not paused.

## Acceptance criteria

- [ ] Backgrounding during `recording` dispatches the same path as Pause.
- [ ] The partial capture is persisted in a kill-safe way. Either restore
      ADTS `.aac` segment capture with the #233 remux on commit, or use an
      equivalent approach.
- [ ] A paused-take marker is written on pause and cleared on stop or
      discard.
- [ ] On relaunch, an unresolved marker prompts Resume or Discard for its
      verse. Unresolvable markers keep the #170 cleanup behavior.
- [ ] Unit tests cover marker write/clear and the recovery prompt decision.
- [ ] Android device QA: pause → kill → relaunch → resume → stop, and the
      committed take plays in full.

## Related

- Parent audit: #528 (epic #526)
- Spec: #49
- Prior implementation: PR #158 (closed, reference only)
- Related: #170, #176, #233, #486
- Assessment: `docs/assessments/play-record-rerecord-audio/`
