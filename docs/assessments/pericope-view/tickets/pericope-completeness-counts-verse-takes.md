# Count verse coverage toward pericope-mode chapter completeness

> Confirmed on device (#534 audit, F.24).

## Summary

`isChapterFullyRecordedPericopeMode` (`src/db/queries.ts`) treats a
pericope as recorded only when a selected take's range equals the pericope
exactly. A pericope recorded verse by verse (shown as a `Stitched` row, #411)
does not count. The Bible tab (`unitRecordedStatus`) counts verse coverage,
so it shows a green check while the Record tab never shows the advance CTA.

## Expected

The Bible tab status and the advance gate agree. Pending product decision
(see Open Questions in the assessment): if verse coverage counts, a pericope
whose verses are all recorded counts as recorded for advancement.

## Actual

After recording every verse in verse mode and switching to pericope mode,
every card shows a check, but the CTA does not appear on the last pericope.

## Steps to reproduce

1. In verse mode, record every verse of a chapter.
2. Switch to pericope mode and open the chapter's last pericope on Record.
3. The stage-advance CTA is missing; the Bible tab shows every pericope as
   recorded.

## Acceptance criteria

- [ ] Product confirms whether verse coverage counts in pericope mode.
- [ ] Completeness in pericope mode uses the same coverage rule as the Bible
      tab status.
- [ ] Unit tests cover mixed verse/pericope coverage in
      `isChapterFullyRecordedPericopeMode`.
- [ ] Android device QA for verse-only, pericope-only and mixed chapters.

## Related

- Parent audit: #534 (epic #526)
- Feature: #542 (PR #550), #411, #408
- Assessment: `docs/assessments/pericope-view/`
