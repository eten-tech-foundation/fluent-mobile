# Block chapter advancement while pericope takes cannot upload

> Confirmed on device (#534 audit, F.23b, G.25).

## Summary

In pericope mode the stage-advance CTA appears once every pericope has a
take (#542). `confirmStageAdvancement` (`src/services/stageAdvance.ts`)
then submits the chapter to the API without checking upload state. Because
pericope takes never upload (see `upload-pericope-takes.md`), a chapter
drafted only with pericope takes reaches Peer Check with no audio on the
server.

## Expected

A chapter does not advance while any of its selected takes cannot reach the
server, or the translator is clearly warned and the advance is deferred.

## Actual

The chapter advances; the peer checker has no draft audio for it.

## Steps to reproduce

1. In pericope mode, record a pericope take for every pericope of a chapter.
2. Go to the last pericope and use the stage-advance CTA.
3. Check the chapter on web or the API: it is in Peer Check with no audio for
   those verses.

## Acceptance criteria

- [ ] The advance CTA is disabled, or shows a blocking explanation, while the
      chapter has selected takes in the unuploadable bucket.
- [ ] Verse-mode advancement is unchanged.
- [ ] Unit tests cover `getStageAdvanceVisibility` / advance with
      unuploadable takes.
- [ ] Android device QA in pericope mode.
- [ ] Can be closed as superseded once pericope takes upload.

## Related

- Parent audit: #534 (epic #526)
- Feature: #542 (PR #550), #410
- Assessment: `docs/assessments/pericope-view/`
