# "Maximum update depth exceeded" during Record tab playback (regression of #298)

> Confirmed on device (#528 audit, C.11 and D.13).

**GitHub issue:** #569

## Summary

React logs `Maximum update depth exceeded` during Record tab Review playback,
including when alternating playback between takes. #298 fixed this path in
August (in-flight load gating in `useVerseAudio`, `shouldEndPlaybackOnIdle`).
Since then, the playback and take-load effects have changed for
cross-granularity stitching and the `REHYDRATE` loop fixes (#411, in
`RecordTab.tsx` and `useVerseAudio.ts`). Those are the likely re-entry
points. The error was not visible in the UI, but #298 reported slowdowns
until reload.

## Expected

Playing, pausing, and switching between takes never triggers an
update-depth error.

## Actual

The error is raised when switching playback from one take to another
(D.13), and when tapping the middle of a take's waveform to play from there
(C.11). It shows in the dev build LogBox, with no functional UI error.
Device: Xiaomi Redmi Note 9 Pro, Android 10.

## Steps to reproduce

1. Record Take 1 and Take 2 on a verse (verse mode).
2. Play Take 1, then switch to Take 2. Alternatively, tap the middle of a
   take's waveform to play from there.
3. Watch the dev build LogBox or Metro logs.

## Acceptance criteria

- [ ] Root cause identified: the component stack and the effect/state cycle
      that re-enters.
- [ ] The fix does not regress #298, #176 scrubbing, or #411 stitched
      playback.
- [ ] Regression test where the loop is reproducible in Jest.
- [ ] Physical Android QA: the steps above across several sessions, with
      no update-depth error.

## Related

- Parent audit: #528 (epic #526)
- Regression of: #298
- Related: #411, #176, #544
- Assessment: `docs/assessments/play-record-rerecord-audio/`
