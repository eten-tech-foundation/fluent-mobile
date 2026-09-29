# Drafting page Audit

## Overview

**Feature:** Drafting page shell (chapter workspace)  
**Auditor:** Matt Race (`@mattrace-buildmidwestern`)  
**Date tested:** 2026-09-22  
**Build/version:** Android Debug / expo-dev-client (`com.eten.fluent`) + Metro (`EXPO_PUBLIC_E2E_MODE=1`) on SDK 57  
**Environment:** `https://dev.api.fluent.bible` (Maestro translator account)  
**Device and OS:** Android Emulator `emulator-5554` (Maestro Pixel 6 / API 33)  
**Audit sub-issue:** [#527](https://github.com/eten-tech-foundation/fluent-mobile/issues/527) (epic [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526))

## Related Issues

- [#47](https://github.com/eten-tech-foundation/fluent-mobile/issues/47) — Build Drafting Page Shell with Tab Navigation (Done)
- [#48](https://github.com/eten-tech-foundation/fluent-mobile/issues/48) — Build Bible Tab with Verse List and Sequential Playback (Done)
- [#412](https://github.com/eten-tech-foundation/fluent-mobile/issues/412) — Build Source Audio Player for Bible Tab (Done)
- [#38](https://github.com/eten-tech-foundation/fluent-mobile/issues/38) / sync header icon behavior (historical; header sync opens Sync screen)
- Sibling audits (out of shell scope): Play/Record, Resources, Offline, Pericope, Chapter assignment

## Expected Behavior

The drafting page is the chapter workspace opened from My Work or a project chapter list (`hrefs.verseDetail`). Translators:

- See a header with book/chapter title, back, and sync status (taps open Sync)
- Switch among Bible / Resources / Record tabs without losing the shared selected verse
- See the chapter source-audio bar on Bible and Record (hidden on Resources and while capturing)
- Restore the last active tab when re-entering the same chapter in-session
- Are blocked from leaving Record (tab switch / back / sync / account) while a take is in progress
- Open Record for a verse by tapping that verse on the Bible tab

Pericope view, deep Record/Resources content, and offline sync orchestration belong to sibling tickets.

## Test Results

Interactive Maestro MCP + exploratory YAML on `emulator-5554`. Durable coverage added as `.maestro/flows/android/smoke-drafting.yaml` (`npm run maestro:test:drafting`). Shell assertions (source-audio visibility, last-tab restore, verse→Record, Projects entry) were re-confirmed interactively after bring-up; a full `clearState` CLI cold start once timed out waiting for Home after login (sync flake residual — see `wait-for-home` 180s note in Maestro guide). Local Debug also needed a Dev Client deep-link after `clearState` emptied server history (helper update below).

| Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|
| My Work → chapter opens drafting shell | Tab bar + Bible default chrome | Genesis 1 opened; `drafting-tab-bar`, Bible tab, source-audio bar visible | Pass |
| Projects → chapter opens drafting | Same shell from project chapter list | Entered drafting; back returned to chapter list | Pass |
| Header sync control | Sync affordance present; navigates to Sync when not capturing | `home-sync-button` visible on drafting header | Pass |
| Tab switch Bible ↔ Resources ↔ Record | Content swaps; shared verse preserved | Tabs switch; verse 3 handoff kept on Resources (`resources-unit-*-3`) | Pass |
| Source-audio bar visibility | Visible on Bible/Record; hidden on Resources | Confirmed via `source-audio-bar` assert / not-visible on Resources | Pass |
| Source-audio empty / loaded states | Empty caption when no chapter audio; controls when loaded | Seed chapter showed empty “No source audio” style bar (not a shell crash) | Pass |
| Bible verse tap → Record | Selected verse + Record tab | Verse/unit selects only; Record does **not** open (`onOpenRecord` ignored after #408 rewrite). Shared verse still works after manual Record tab tap. | Fail → gap [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564) |
| Last-tab restore | Re-open same chapter restores last tab | Left on Record; re-open restored Record | Pass |
| Cross-chapter default | New chapter without memory defaults Bible | Opened Genesis 2 → Bible default | Pass |
| Recording leave guard (tab / back) | Alert; stay on Record until stop | Mid-recording: tab leave and system back showed “Recording in progress” | Pass |
| Offline chrome on shell | Offline indicator when offline | “Offline · nothing pending” observed during session | Pass (observational) |
| Background / resume tab state | Session preserves tab | Not fully re-verified this run | Blocked / residual |
| Missing assignment / empty chapter | Empty state copy | Not forced on seed account | Blocked / residual |

## Offline and Synchronization Results

Shell chrome only (full sync/offline journeys are sibling audits).

| Scenario | Result | Notes |
|---|---|---|
| Feature used while offline | Pass | Offline banner visible on drafting; tabs still navigable |
| App closed and reopened offline | N/A | Not retested this audit |
| Device returns online | N/A | Sibling sync audit |
| Offline changes synchronize | N/A | Sibling sync audit |
| Conflicting changes are handled | N/A | Sibling sync audit |

## Gaps Identified

### Bible unit tap does not open Record (`onOpenRecord` ignored)

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#47](https://github.com/eten-tech-foundation/fluent-mobile/issues/47), [#408](https://github.com/eten-tech-foundation/fluent-mobile/issues/408) / PR #535  
**Development task:** [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564) · [tickets/restore-bible-onOpenRecord.md](./tickets/restore-bible-onOpenRecord.md)

**Description:**  
`DraftingScreen` still passes `onOpenRecord={() => setActiveTab('record')}`, but `BibleTab` discards props (`_props`) and `handleUnitPress` never invokes the callback. Selecting a unit on Bible no longer auto-switches to Record.

**Steps to reproduce:**

1. Open a chapter from My Work → Bible tab.
2. Tap verse/unit `3`.
3. Observe selection without Record tab activation.

**Expected behavior:**  
Bible unit tap selects the unit and opens Record (shell contract).

**Actual behavior:**  
Selection only; user must tap the Record tab manually.

**Evidence:**  
`src/app/tabs/BibleTab.tsx` (`_props`, `handleUnitPress`); `DraftingScreen.tsx` still wires `onOpenRecord`.

### Notes (not filed as additional product bugs)

- **mpix on 8081 “still showing”:** Fluent Metro was listening on `:8081`; an **iOS Simulator** `mpixapp` process had open TCP clients to that port (and Expo Dev Client history can list old URLs after a kill). Killing the `mpixapp` client cleared the confusion — not a Fluent product gap.
- Expo Dev Client **history** can still list prior Metro URLs after that process is killed; that is launcher history, not a live server. Local Maestro expects fluent Metro + `adb reverse` + `EXPO_PUBLIC_E2E_MODE=1`. After `clearState`, `.maestro/helpers/dismiss-expo-dev-menu.yaml` deep-links to `127.0.0.1:8081` when the empty “DEVELOPMENT SERVERS” launcher is shown.
- Recording leave-guard is covered interactively; durable automation of capture+alert is deferred to Record sibling coverage / future extension of `smoke-record.yaml`.
- Bible verse rows lack stable `testID`s; smoke uses visible verse number text / a11y. Acceptable for now; add `bible-verse-{n}` only if automation flakes.

## Open Questions

- Whether every assigned chapter on `dev.api.fluent.bible` is expected to have downloadable source audio (empty bar vs API gap) — belongs with source-audio / data seed ownership, not shell wiring.
- Background-resume and cold-start last-tab persistence beyond in-session memory — residual manual on nightly.

## Audit Summary

**Overall result:** Pass with gaps

**Summary:**  
The drafting shell mostly matches the chapter-workspace contract (entry, tabs, source-audio visibility, last-tab restore, recording leave guards). One medium gap: Bible unit tap no longer opens Record after the #408 rewrite — tracked as [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564). Durable Maestro coverage is in `smoke-drafting.yaml` (asserts shared verse via explicit Record tab tap until #564 lands).

**Follow-up required:**

- [x] All identified gaps have corresponding GitHub issues.
- [x] Mobile and API dependencies are cross-linked. _(n/a)_
- [x] Launch-blocking gaps are clearly identified. _(none; #564 is medium)_
- [ ] Assessment has been reviewed and merged.

**Merged assessment:** _(pending PR merge — link from #527 comment after merge)_
