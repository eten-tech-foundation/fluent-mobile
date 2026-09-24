# Make the Prepare for Offline auto-prompt fire consistently

> Confirmed on device (#529 audit, A.1–A.4, first run and isolated re-test).

## Summary

#39 requires Prepare for Offline to open automatically on Home when Wi-Fi is
available and the project's connectivity profile calls for it, to re-surface
on every app open until Download is tapped, and to stay closed on cellular
(toggle off) and after a download has started. On the device the screen
sometimes opens and sometimes does not, in all four scenarios, including an
isolated re-test with a single-project account after clearing app data. The
behavior needs a full evaluation.

Code notes (`src/app/screens/HomeScreen.tsx:176-269`), candidate causes to
confirm during the fix:

- The check only runs on specific events: an `AppState` transition to
  `active`, Home regaining focus (or connectivity turning eligible) with an
  eligible connection (`:247-261`), and sync-complete callbacks.
- It returns early while Home is "settling" (post-login sync, new-user
  loading, any sync in progress) or before connectivity has resolved
  (`:178-179`). The sync-complete handlers (`:104-108`, `:110-114`,
  `:137-142`) call it in the same tick in which they clear the
  loading/syncing state, but `isSettlingRef` is only updated later in an
  effect (`:131-134`). That evaluation can still see "settling" and return,
  and nothing retries it.
- `prepareOfflinePromptShownThisAppOpenRef` is reset only on a
  background → active transition, and `evaluateInFlightRef` drops concurrent
  calls instead of queueing them.
- It reads `getProjectsWithSummary` (`HomeScreen.tsx:198`), which can fail on
  large databases on this device model (#483). A failure means no prompt and
  no visible error.
- It opens the screen with no `projectId` (`HomeScreen.tsx:220`), so the
  translator lands on the project picker instead of the project that
  triggered it.

## Expected

- On Home with an eligible connection, the prompt opens every time the rules
  in #39 say it should, and never when they say it should not.
- Dismissing without downloading re-surfaces it on the next app open.
- After Download starts for the project, it never opens again for that
  project.

## Actual

- A.1–A.4: the prompt opens intermittently in every scenario, with no
  observable pattern.

## Steps to reproduce

1. Clear app data, sign in on Wi-Fi with a single-project account, and wait
   for the first sync to finish on Home.
2. Background the app and return, three times. Then kill it from Recents and
   reopen.
3. Repeat on cellular with "Upload/Download over cellular" off, then on Wi-Fi
   after tapping Download.
4. Record whether Prepare for Offline opened on each attempt.

## Acceptance criteria

- [ ] The evaluation reads the current settling state (not a ref updated in
      a later effect) and, when it is skipped for settling, runs again once
      settling ends instead of being dropped.
- [ ] Deterministic results for the #39 matrix (Rarely / Sometimes ±
      assigned / Usually / unset × Wi-Fi / cellular ± toggle) and for the
      re-surface and download-started rules.
- [ ] Project summary failures (#483) are logged, and a failure does not
      suppress the prompt permanently.
- [ ] The prompt opens the triggering project, or product confirms the
      picker (see Open Questions in the assessment).
- [ ] Unit tests cover the evaluation triggers and the settling retry.
- [ ] Android device QA: the steps above produce the same result 3 times in
      a row.

## Related

- Parent audit: #529 (epic #526)
- Spec: #39 (PR #242)
- Related: #483, #546 / PR #559 (changes the transport rule used by the
  trigger)
- Assessment: `docs/assessments/going-offline/`
