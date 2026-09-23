# Align stitched take row waveform and timer with other take rows

> Confirmed on device (#528 audit, G.28).

**GitHub issue:** #571

## Summary

In pericope view, the stitched row (#411) renders its waveform and timer
further right than a pericope take row. Stitched rows cannot be deleted, so
`DraftTakeRow` renders them without the trailing delete icon. The waveform
and timer then take that space, and the two rows no longer line up.
Stitched playback itself works as specified.

## Expected

Waveforms and timers line up across all take rows in the list, whether or
not a row has a delete action.

## Actual

The stitched row's waveform and timer (`0:00 / 0:03`) sit further right
than the pericope row's (`0:00 / 0:02`).

## Steps to reproduce

1. In verse mode, record a take for one or more verses of a pericope.
2. Switch to pericope mode and record a pericope take for the same pericope.
3. On the Record tab, compare the "Pericope" row with the "Stitched" row.

## Acceptance criteria

- [ ] Rows without a delete action reserve the trailing slot (for example an
      empty spacer the width of the delete icon), so waveforms and timers
      align.
- [ ] Other row kinds (verse, pericope, All Takes) keep their current
      layout.
- [ ] A component test covers the stitched row layout slot.
- [ ] Android device QA with a pericope take and a stitched row in the same
      list.

## Related

- Parent audit: #528 (epic #526)
- Feature: #411 (merged in PR #506, passed QA)
- Related: #474 (take card layout)
- Assessment: `docs/assessments/play-record-rerecord-audio/`
