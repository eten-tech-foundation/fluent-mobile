# Show the full pericope take label on the Record tab

> Confirmed on device (#534 audit, D.17).

## Summary

Pericope take cards (#410) show a subtitle such as
`Take 1 - Pericope - vv. 1-13`. In `DraftTakeRow` (and `SharedTakeRow`) the
label uses `numberOfLines={1}` and shares the top row with the playback
timer, so on a phone the verse range is cut to `vv. …`. This was reported
as #474, which was closed as opened by mistake and never re-created.

## Expected

The full label, including the verse range, is readable on a typical phone
width, and the timer stays visible (label format from #410; #411: "never
truncated").

## Actual

On Mark 1:1–13 the label reads `Take N - Pericope - vv. …`.

## Steps to reproduce

1. Settings → Drafting unit → Pericope.
2. Open Mark 1 and record a take for the pericope Mark 1:1–13.
3. Read the take card label on the Record tab.

## Acceptance criteria

- [ ] The full pericope and stitched labels are visible on a typical phone
      width, including cross-chapter ranges (for example `vv. 8:31-9:1`).
- [ ] The playback timer stays visible and usable.
- [ ] Verse labels (`Take N - Verse - v. X`) still look correct.
- [ ] Component tests for `DraftTakeRow` / `SharedTakeRow` cover a long
      label.
- [ ] Android device QA with a long pericope label.

## Related

- Parent audit: #534 (epic #526)
- Feature: #410 (PR #473), #411
- Earlier report: #474 (closed as opened by mistake)
- Assessment: `docs/assessments/pericope-view/`
