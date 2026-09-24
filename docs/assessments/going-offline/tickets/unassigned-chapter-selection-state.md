# Unassigned Prepare for Offline: open the chapter accordion and disable Download

> Confirmed on device (#529 audit, B.7).

## Summary

For a translator with no assigned chapters in the project, #50 and #51
require the chapter accordion to open by default and the Download button to
stay disabled until at least one chapter is selected. PR #341 ("Show
disabled Download button for unassigned users with no chapters", #51)
targeted the button state. On `main` @ `d5b9e64`, the device showed the
accordion collapsed and Download enabled, with no chapter selected.

Code notes (causes to confirm during the fix):

- Open question for the collapsed accordion: `buildInitialSelection`
  (`src/hooks/usePrepareOfflineSelection.ts:17-24`) sets `isAssignedUser` and
  pre-selects the same chapters, so it cannot produce "collapsed + nothing
  selected". Check whether `initializedForKeyRef` (`:61-67`) keeps an earlier
  accordion toggle when the same project is entered again, or whether the
  chapter rows carry an unexpected `assignedUserId`.
- `usePrepareOfflineResources` disables Download for unassigned users with
  zero chapters selected (`src/hooks/usePrepareOfflineResources.ts:104-106`),
  but the screen uses `canDownloadNow`
  (`src/hooks/usePrepareOfflineDownload.ts:313-314`), which is also true
  whenever the project has `queued` / `cancelled` / `failed` / `paused` queue
  rows, for example after an earlier Cancel.

## Expected

- Unassigned: the chapter accordion is open, no chapter is pre-selected, and
  Download is disabled until at least one chapter is selected (#50, #51).

## Actual

- The accordion is collapsed, no chapter is selected, and Download is enabled
  (B.7).

## Steps to reproduce

1. Sign in as a translator with no assigned chapters in a project.
2. Settings → Prepare for Offline → pick that project.
3. Observe the chapter accordion and the Download button.

## Acceptance criteria

- [ ] Unassigned users see the chapter accordion open on first entry.
- [ ] Download stays disabled with zero chapters selected, including when the
      project has leftover resumable queue rows (Resume those through the
      paused/cancelled controls instead).
- [ ] Assigned users keep the collapsed "Assigned chapters (n)" state.
- [ ] Unit tests cover the unassigned + leftover-queue case.
- [ ] Android device QA: unassigned project → accordion open, Download
      disabled until a chapter is selected.

## Related

- Parent audit: #529 (epic #526)
- Spec: #50, #51; prior fix PR #341
- Related: #147 (PR #436 changed the enqueue gate to `canDownloadNow`)
- Assessment: `docs/assessments/going-offline/`
