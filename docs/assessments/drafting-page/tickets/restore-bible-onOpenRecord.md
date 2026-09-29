# Restore Bible tab `onOpenRecord` (verse/unit → Record)

## Summary

After the verse/pericope Bible tab rewrite (#408 / PR #535), `BibleTab` ignores its `onOpenRecord` prop. `DraftingScreen` still passes `onOpenRecord={() => setActiveTab('record')}`, but unit presses only call `setSelectedVerse` (and expand pericopes). Translators must manually switch to the Record tab after selecting a unit.

## Expected

Tapping a verse (or pericope unit) on the Bible tab selects that unit **and** opens the Record tab for it — matching #47 shell contract and the existing `DraftingScreen` wiring.

## Actual

`export function BibleTab(_props: BibleTabProps = {})` discards props. `handleUnitPress` never calls `onOpenRecord`.

## Steps to reproduce

1. Open a chapter from My Work into drafting (Bible tab).
2. Tap verse `3` (or any unit).
3. Observe: unit selects; Record tab does **not** become active.
4. Manually tap Record — selected verse is correct.

## Acceptance criteria

- [ ] `BibleTab` uses `onOpenRecord` from props (not `_props`).
- [ ] `handleUnitPress` calls `onOpenRecord?.()` after selecting the unit (verse mode and pericope mode).
- [ ] Unit test asserts pressing a verse unit invokes `onOpenRecord`.
- [ ] Maestro `smoke-drafting` can assert Bible unit → Record without an extra tab tap (update flow when fixed).

## Related

- Parent audit: #527
- Historical: #47
- Regression from: #408 / PR #535
- Assessment: `docs/assessments/drafting-page/`
