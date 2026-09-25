# Handle pericope mode when the project has no local pericope data

> Silent fallback confirmed on device (#534 audit, I.29a); hidden advance CTA
> from code.

## Summary

When the project has no `pericope_set_id`, or its set has no local rows, the
Bible and Record tabs silently fall back to verse mode (`effectiveUnit` in
`src/hooks/useBibleTabUnits.ts`; the fallback comment in `RecordTab.tsx`).
If a set id exists but has no rows, `isOnLastUnit` in `RecordTab.tsx`
requires `activePericope !== null`, which never happens, so the
stage-advance CTA never appears.

## Expected

The translator can tell that pericope mode is unavailable for this project,
and chapter advancement still works (falling back to verse rules).

## Actual

Settings says Pericope and the tabs show verses without explanation (I.29a).
From code, when the project has a set id but no local rows (not
device-tested), the advance CTA is also never shown on the last verse.

## Steps to reproduce

1. Use a project whose set is not bundled (or a book missing from the
   bundled set).
2. Settings → Drafting unit → Pericope.
3. Record every verse, then open the last verse on Record: no advance CTA
   (from code; not yet device-tested).

## Acceptance criteria

- [ ] `isOnLastUnit` falls back to the last verse when no pericope data
      resolves.
- [ ] The UI explains that pericopes are unavailable for this project (copy
      agreed with product).
- [ ] Unit tests cover the no-data path for `isOnLastUnit`.
- [ ] Android device QA with a project that has no pericope data.

## Related

- Parent audit: #534 (epic #526)
- Feature: #409, #542 (PR #550), #438
- Assessment: `docs/assessments/pericope-view/`
