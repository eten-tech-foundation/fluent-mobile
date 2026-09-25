# Upload pericope takes to the server

> Confirmed on device (#534 audit, G.25–G.26).

## Summary

Takes recorded in pericope mode (#410) are stored locally with
`granularity = 'pericope'` and a verse range, but they never upload. The
upload worker and pending counts only accept verse takes
(`UPLOADABLE_PENDING_WHERE` in `src/db/queries.ts`), and fluent-api's
verse-audio routes are keyed by a single `bibleTextId`
(`PUT /verse-audio/{projectUnitId}/{bibleTextId}`). The API gap was noted on
#410 but no follow-up exists in either repository.

## Expected

A pericope take uploads like a verse take, and the server keeps its
granularity and verse range, so web, peer checkers and other devices can
play it.

## Actual

The take stays on the device. The Sync page reports "N recordings can't
upload yet — missing bible text or pericope-only takes."

## Steps to reproduce

1. Settings → Drafting unit → Pericope.
2. Open a chapter whose project has a pericope set and record a pericope take.
3. Go online and open Sync: Sync Now is disabled and the red "can't upload
   yet" message shows.
4. Check the chapter's audio on web or the API: no audio rows for those
   verses.

## Acceptance criteria

- [ ] fluent-api accepts a range take (granularity, start/end chapter and
      verse) with list/get/delete semantics compatible with conflict
      detection (fluent-api#271). The fluent-api issue is opened at
      implementation time and linked here.
- [ ] Mobile uploads selected pericope takes through that endpoint and marks
      them `uploaded`.
- [ ] Pericope takes leave the "can't upload yet" bucket on the Sync page.
- [ ] Sync Now stays usable for downloads while takes are pending. Today
      `syncNowDisabled` (`noUploadableChapters` in `SyncScreen.tsx`)
      disables it when every pending take is a pericope take, so the user
      cannot pull server changes from Sync Now either (seen in G.25).
- [ ] Unit tests cover the upload query and worker for pericope takes.
- [ ] Android device QA: record a pericope take, sync, confirm on web/API.

## Related

- Parent audit: #534 (epic #526)
- Feature: #410 (API gap section), #411
- Assessment: `docs/assessments/pericope-view/`
