# Offer Resume or Discard when leaving an in-progress take

> Confirmed on device (#528 audit, B.7a). Discard copy and behavior need product confirmation.

## Summary

#49 specifies that navigating away from a paused take (prev/next verse, or
leaving the drafting page) prompts the translator to **resume or discard**.
Discarding returns the verse to its prior recording state. The app today
shows an OK-only "Recording in progress" alert
(`RecordTab.tsx` `requestVerseChange`, `DraftingScreen.tsx` guards). There is
no discard path in `useVerseAudio`: Stop is the only exit, and it always
commits a take that counts toward the 5-take cap.

## Expected

Prev/next verse, tab change, back, Sync, or account switch while `paused`
(or `recording`) shows a prompt with **Resume** and **Discard**. Discard
drops the capture without creating a take, then continues the navigation.

## Actual

An "OK" alert only. The translator must return, tap Stop (creating a take),
and delete that take.

## Steps to reproduce

1. On the Record tab, record, then tap Pause.
2. Tap the next-verse chevron (or header back).
3. Observe the OK-only alert with no Discard option.

## Acceptance criteria

- [ ] The leave prompt offers Resume and Discard (copy approved by product).
- [ ] Discard stops the recorder, deletes the temp file, creates no DB row,
      and restores the prior Idle or Review state.
- [ ] After Discard, the originally requested navigation proceeds.
- [ ] Unit tests cover the discard path in `useVerseAudio` and the reducer.
- [ ] Android device QA for verse change and back navigation.

## Related

- Parent audit: #528 (epic #526)
- Spec: #49
- Assessment: `docs/assessments/play-record-rerecord-audio/`
