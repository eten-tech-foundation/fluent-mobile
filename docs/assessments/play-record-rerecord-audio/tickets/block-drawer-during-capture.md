# Block drawer navigation while a take is recording or paused

> Confirmed on device (#528 audit, B.7b).

**GitHub issue:** #568

## Summary

`DraftingScreen` guards the ways out of the drafting page while a take is in
progress (`recordCaptureActive`): tab change, header or system back
(`beforeRemove`), Sync, and account switch. The root drawer
(`src/routes/(app)/_layout.tsx`, `swipeEnabled: true`) is not guarded, so a
translator can open it mid-take and navigate to Settings, then Home. When
the drafting screen unmounts (Settings returns Home via
`router.replace(hrefs.home())`), `useRecordingEngine` force-stops the
recorder without persisting the capture, and the take is discarded silently. The same drawer
also offers account switch (`resetNavigationAfterAccountSwitch` →
`router.dismissAll()`), Add User, and Sign Out, and each of those also
bypasses the drafting guards.

## Expected

While a take is recording or paused, the drawer cannot be opened (swipe or
menu). If it is opened, drawer navigation shows the same "Recording in
progress" guard, and no in-progress audio is discarded without the
translator choosing to.

## Actual

The drawer opens and navigates away. On return, the in-progress take is gone.

## Steps to reproduce

1. Open a chapter, go to the Record tab, record, then pause.
2. Swipe from the left edge to open the drawer, go to Settings,
   then back to Home.
3. Reopen the same verse: there is no take and no recovery prompt.

## Acceptance criteria

- [ ] While `recordCaptureActive`, drawer swipe is disabled for the drafting
      screen and any menu entry point is blocked with the existing guard.
- [ ] Account switch, Add User, and Sign Out from the drawer are blocked
      or prompted while `recordCaptureActive`.
- [ ] No navigation path out of drafting while capturing discards audio
      silently. Unmount without a stop must go through the same path as
      `restore-kill-safe-paused-take-recovery.md` (persist or prompt), not a
      bare `engine.stop()`.
- [ ] A unit test covers the drawer guard.
- [ ] Android device QA: repeat the steps above, and the take is preserved
      or navigation is blocked.

## Related

- Parent audit: #528 (epic #526)
- Specs: #49, #47
- Related gap: `tickets/restore-kill-safe-paused-take-recovery.md`
- Assessment: `docs/assessments/play-record-rerecord-audio/`
