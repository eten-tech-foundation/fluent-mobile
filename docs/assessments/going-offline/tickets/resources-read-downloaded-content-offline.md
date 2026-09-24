# Show downloaded resources offline in the Resources tab

> Confirmed on device (#529 audit, G.26).

**GitHub issue:** #578

## Summary

#192 requires Resources content (Translation Notes, Translation Questions,
Images & Maps) to come from the Prepare for Offline download, with no network
calls once it is on the device. On `main`, all three sections always load
from fluent-api:

- `src/services/translationNotes.ts:107` → `FluentAPI.getTranslationNotes`
- `src/services/translationQuestions.ts:107` → `FluentAPI.getTranslationQuestions`
- `src/services/imagesMaps.ts:73` → `FluentAPI.getTranslationImages`

The download inventory only decides which sections are visible when offline
(`src/utils/resourcesSectionInventory.ts:76-88`). A section can therefore
appear offline and then fail to load. This path changed after #192 closed:
the fluent-api cutover (PR #381) and online-without-gating (PR #387). On top
of that, the downloaded files are still fixtures until #504 lands (PR #562,
open).

## Expected

- After Prepare for Offline completes for a chapter, its Resources sections
  show the downloaded content in airplane mode, with no network request.
- Sections whose content was not downloaded show the unavailable state
  (#192), not an endless loader or a generic error.

## Actual

- G.26: on a chapter prepared for offline, in airplane mode, the Resources
  tab shows no content, only "Unable to load" with Retry.
- G.27: on a chapter that was not prepared, the tab correctly shows "No
  resources are on this device yet. Download them from Prepare for Offline."

## Steps to reproduce

1. On Wi-Fi, open Settings → Prepare for Offline, pick a project, keep all
   resources selected, and download one chapter.
2. Turn on airplane mode.
3. Open that chapter, then open the Resources tab.
4. Open Translation Notes, Translation Questions and Images & Maps.

## Acceptance criteria

- [ ] TN / TQ / Images & Maps read the Prepare for Offline download when it
      exists for the unit, and make no network call when offline.
- [ ] When online, the current fluent-api path still works (or reads local
      first; product to confirm).
- [ ] A section with no downloaded content shows the unavailable state offline.
- [ ] Depends on real manifest downloads (#504 / PR #562) and on image kind
      persistence (#417).
- [ ] Unit tests cover the local-first loader and the offline unavailable
      state.
- [ ] Android device QA: download → airplane mode → all three sections render.

## Related

- Parent audit: #529 (epic #526)
- Spec: #192 (closed), #188
- Related: #417, #504, PR #381, PR #387; sibling audit #531
- Assessment: `docs/assessments/going-offline/`
