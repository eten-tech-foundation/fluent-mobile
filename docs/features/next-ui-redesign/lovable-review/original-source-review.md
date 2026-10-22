# Original bounded source review — 2026-10-20

Historical source observations, not rendered comparison or current implementation status.
See [provenance and current ownership](../lovable-review.md) before interpreting this review.
The review body below is retained verbatim from the original result, beginning at its scope statement; preliminary progress narration is omitted.

---

I did one bounded, read-only audit. Nothing was edited, and I ran no tests, emulator, browser or remote writes. I read all 15 theme files, `appStyles.ts`, about 10 shared components, and the theming guide. I also grepped real call sites. In the Lovable stylesheet, I only read the declared custom properties and the `rounded-*` / `text-*` utility rules.

**Main result:** the token architecture is solid. The biggest confirmed problem is that only a handful of shared components follow the Legacy/Next switch at runtime. With Next selected, screens render a mix of Next and Legacy values. Everything below is source evidence. None of it is visual proof.

---

## 1. Existing design-system map

**How a theme is chosen at runtime (one path):**
- `src/theme/uiVersionTypes.ts` defines the two UI versions (`legacy` is the default, `next`) and the colour modes (`hardware` is the default; `canvas` and `accent` exist).
- `src/theme/uiVersion.ts:13-18`: `resolveTheme()` returns `legacyTheme` for Legacy, or the Next theme for the given mode. Legacy ignores modes.
- `src/theme/useTheme.ts`: `useUiVersion()` reads the stored preference (or the gallery's `UiVersionOverride`). `ColorModeScope` / `useColorMode()` set the mode. `useTheme()` and `useThemedStyles()` (memoised on theme identity) are the runtime hooks.
- The preference is toggled in Settings → Interface (`SettingsScreen.tsx:149-158`). The gallery always pins Next (`ComponentGalleryScreen.tsx:34`).

**Sources of token values:**
- **Legacy (frozen):** `tokens.ts` (colours, spacing, radius, typography, workflow stages, shadows, waveform), `layout.ts` (`listCard`, `homeListContent`, `workflowBadge`), `iconSpecs.ts` (icon sizes, stroke widths, `headerLayout`, logo). `legacyRoles.ts` maps Foundations role names onto the nearest Legacy colours.
- **Legacy assembly:** `legacy.ts:18-46` builds `legacyTheme`, and `legacy.ts:49` aliases it as `theme`. The static `theme` export is always Legacy.
- **Next (Figma Foundations):** `nextPrimitives.ts` (bone/blue/red ramps), `nextRoles.ts` (one role set per mode), `nextFoundation.ts` (spacing, radius, type, motion).
- **Next assembly:** `next.ts:105-130` deep-merges Next values onto Legacy and re-derives `listCard`, `homeListContent` and `headerLayout` (`next.ts:77-98`). `next.ts:136-154` maps roles onto `Theme.colors`.
- `elevation.ts` builds shadows from roles.
- The Legacy snapshot test (`legacyTheme.test.ts:20-21`) guards the frozen Legacy values.
- **Lineage:** the `tokens.ts` comments cite Lovable/mock classes, so Lovable is the lineage for **Legacy**. Next's lineage is Figma (`next.ts:184`). A Lovable comparison therefore only applies to Legacy mode.

**How call sites consume the theme (grep, non-test files):**
- About 90 files import the static `theme` barrel, which is Legacy-pinned.
- Only 14 files import `useTheme`. Excluding gallery, hooks and root layouts, the shared UI ones are `ScreenContainer`, `Key`, `KeyDeck`, `ProgressRing`, `RoundButton` and `Switch`. `RoundButton`'s only non-gallery user is `ProgressRing`.
- `appStyles` has 3 non-test importers (details in finding B).

**Shared primitives and their real callers:**

| Primitive | Callers |
|---|---|
| `ScreenContainer` (Next-aware) | Home, Sync, Settings, Drafting, PrepareForOffline, ViewProject, Gallery |
| `StackScreenHeader` → `AppHeader` (static) | PrepareForOffline, Sync, Settings, ViewProject, Gallery, `LegalDocumentLayout` |
| `PageHeader` → `AppHeader` (static) | Home only |
| `TabBar` (static) | Home only |
| `ListCard` (static) | `ProjectRow`, `ProjectChapterRow`, `MyWorkRow`, `MilestoneRow` |
| `SettingsListRow` exports (static) | Sync, Settings, `ReauthBanner` |
| `authFormStyles.ts` (static) | Auth form screens |

---

## 2. Findings

### A. High — mixed Legacy and Next styling on every real Next screen (confirmed in source; visual effect unverified)

The page background follows Next, but the chrome drawn on top of it is pinned to Legacy at module load:

- **Next-aware:** `ScreenContainer.tsx:17-22` (`useThemedStyles` → `colors.background`), the root layout (`routes/_layout.tsx:68-75`), and the drawer container (`routes/(app)/_layout.tsx:41,87-96`).
- **Legacy-pinned:**
  - `AppHeader.tsx:13,24-40`: the header tone palette is a module-level constant built from the static `theme`.
  - `ListCard.tsx:10,69-80`
  - `TabBar.tsx:4,56-83`
  - `SettingsListRow.tsx:4,173-239`
  - `PageHeader.tsx:4,38-61`
  - `UserSettingsMenu.tsx:209,415`: drawer content uses static `cardBackground` while its container uses the runtime theme.

In Next Hardware mode, the page background resolves to bone[50] `#EFEFE9` (`nextRoles.ts:70`). Stack headers, cards and tab bars stay Legacy `#eaeef5` with Legacy borders.

This is the expected *in-progress* state per `docs/guides/ui-version-theming.md:66-71,96`. It is not a Legacy bug. But it means no Next screen outside the gallery is internally consistent today.

### B. Medium — `appStyles.ts` is mostly dead and off-palette (confirmed)

The file is 486 lines with 68 colour literals, but only 7 keys are actually used:
- `appRoot` (`routes/_layout.tsx:97`)
- `containerAppInit`, `errorTextAppInit`, `loadingTextAppInit` (`AuthSessionProvider.tsx:202-208`)
- `menuDivider`, `menuSectionLabel`, `menuItemDanger` (`UserSettingsMenu.tsx:247,305-306,385,392`)

The other two `appStyles.menuItem` matches are comments. Dead keys carry off-token values such as `#1a6ef5`, `#e53935`, `#d1d1d6`, `#172b4d` and `#de350b`. The code-style rule says "reuse existing keys", which invites future reuse of these.

Live conflict in the drawer's sign-out row: the row's tint is `theme.colors.destructive` = `#DC2626` (`UserSettingsMenu.tsx:388`), but its label style is `menuItemDanger` = `#d32f2f` (`appStyles.ts:247`). That is two different reds on one row. Which one actually renders for the label is unverified. `menuSectionLabel` (`#999`, 11px, `appStyles.ts:238-246`) is also off-scale.

### C. Medium — near-duplicate status colours in `tokens.ts` (confirmed duplication; which is "right" is unverified)

- **Synced green:** `syncSynced` `#16A34A` (`tokens.ts:68`) vs `syncStatusSynced` `#17B26A` (`:72`).
- **Pending yellow:** `syncUnsynced` `#EAB308` (`:69`) vs `syncStatusPending` `#E48F06` (`:73`).
- **Who uses which:** `RecordingCloudIcon.tsx:13,18`, Prepare Offline, BibleTab and the auth success circle use the first family. `CloudSyncStatusIcon.tsx:203-308` uses the second.
- **Workflow badges:** the hand-picked `workflowBadgeDraftBorder` `#FBBF24` and `workflowBadgePeerCheckBorder` `#EA580C` (`:89,91`) sit next to the HSL-derived stage colours (`:109,114`, which compute to about `#FBBD23` and `#E7560E`). BibleTab still uses the hand-picked draft colour (`BibleTab.tsx:49`).

Declared CSS (read, not rendered): the Lovable stylesheet has one sync family. `--sync-synced: 152 77% 39%` (about `#17B068`) and `--sync-unsynced: 37 95% 46%` (about `#E58F06`) closely match the app's `syncStatus*` values. I found no declared CSS counterpart for `#16A34A` or `#EAB308`.

### D. Medium — card radius comment disagrees with the declared CSS (CSS token confirmed; whether the mock card actually uses it is unknown)

- `layout.ts:15-20` labels `listCard` as Lovable `rounded-lg` but uses `radius.sm` = 8px.
- The stylesheet declares `.rounded-lg{border-radius:var(--radius)}` and `--radius: .75rem`, which is 12px. `radius.md` is already 12.
- A similar comment/value gap: `tokens.ts:175-176` says the record timer is `text-4xl` / 2.25rem (36px), but the value is 32.
- The downloaded HTML is an SPA shell, and I did not inspect the JS bundle. So which classes the mock card actually renders with is **unknown**.

### E. Low–Medium — disabled/pressed states and stray literals (confirmed inconsistency)

- **Disabled opacity:** `theme.opacity.disabled` = 0.4 exists (`legacy.ts:31`), but disabled styling varies:
  - 0.5: `SettingsListRow.tsx:203`, `AccountSwitcherPanel.tsx:345`, `SyncActionControls.tsx:240`, `PrepareOfflineDownloadFooter.tsx:252,283`
  - 0.6: `authFormStyles.ts:150`, `StageAdvanceConfirmSheet.tsx:150`
  - 0.4: `RecordCircleButton.tsx:88`, `RecordTab.tsx:1680`
- **Pressed opacity** ranges from 0.7 to 0.95:
  - 0.7: `SettingsListRow`, `AppHeader:54`, `PageHeaderSyncButton`
  - 0.75: `AccountInitialsButton`
  - 0.8: `AccountSwitcherPanel`, `LoginScreen`
  - 0.85: `RecordCircleButton`
  - 0.95: `listCard`
- **Duplicate overlay literal:** `AccountSwitcherPanel.tsx:221` hardcodes the exact value of `colors.drawerOverlay` (`tokens.ts:82`).
- **Off-token colours** in the same file: `#F3F7FF`, `#2E5BD8`, `#F1F4FA`, `#FDECEC` (`:270,284,328,352`).
- **Auth card colour** `#fffef9` is a local constant in `authFormStyles.ts:4` and is duplicated in dead `appStyles` code.

### Intentional mobile adaptations (do not "fix")

- Safe-area header padding (`useHeaderSafeAreaPadding`) and touch hit-slop (`iconSpecs.ts:20`).
- Waveform bar gap of 3 instead of 2 ("slightly roomier for RN", `tokens.ts:203-204`).
- The Legacy/Next split itself, Next's Hardware/Canvas/Accent modes, and the gallery pinning Next.
- Android-only status bar handling in `AppHeader`.
- The CSS's dark-theme variables have no Legacy equivalent; that looks intentional since Legacy is light-only.

### Unknown reference facts

- Whether the live Lovable site still matches source commits `4727043` / `d12434c`.
- Font: the CSS declares IBM Plex Sans, while the app uses `System` (`tokens.ts:168`; Next is also "TBD", `nextFoundation.ts:5`). Unknown whether that is an intentional adaptation.
- Viewport and density of the reference, and which mock route corresponds to which app screen.

---

## 3. Page/state inventory outline (not exhaustive; defer to the other worker)

- **App init:** loading and error (`AuthSessionProvider`).
- **Auth:** Login, Forgot Password plus its success state, Reauth (compact card), Privacy/Terms (`LegalDocumentLayout`).
- **Home:** `PageHeader` with logo, sync button and settings; `TabBar` switching Milestones (`ProjectsTab`) and My Work; Reauth banner; empty and loading states; offline-prompt.
- **ViewProject:** chapter rows with phase, ownership, conflict and sync states.
- **Drafting:** `DraftingHeader`/`DraftingTabBar` with Bible, Record and Resources tabs; the source-audio dock; Record states (idle, capture, paused, review); take rows; stage-advance sheet.
- **Sync:** action controls and upload progress.
- **Settings:** sections, UI-version segmented control, reauth row, gallery row.
- **Prepare for Offline:** selection, download footer, storage management.
- **Drawer:** `UserSettingsMenu` and `AccountSwitcherPanel` (active row, add account, limit reached, error).
- **Gallery** (Next-pinned).

Every surface should be checked in both UI versions, and sync-sensitive surfaces across synced, pending, offline and failed states.

---

## 4. Implementation batches (smallest first)

### Batch 1 — remove dead styles and duplicate literals; no visual change
- **Files owned:** `src/app/appStyles.ts` (delete the unused keys and keep the 7 live ones) and `src/components/ui/AccountSwitcherPanel.tsx:221` (replace the overlay literal with `theme.colors.drawerOverlay`).
- **Unchanged by contract:** every rendered value. The overlay value is identical, and the deleted keys have no references. `tokens.ts` and the Legacy snapshot stay unchanged.
- **Tests:** `typecheck` catches any removed key that is still referenced. Run the existing `UserSettingsMenu.test.tsx`, `Accountswitcherpanel.test.tsx` and `legacyTheme.test.ts` (snapshot must not change).
- **Later gate:** one device spot-check of the drawer, account switcher and app init.
- **Deliberately left out:** the `menuItemDanger` red and `#fffef9` both change visuals and need a decision.

### Batch 2 — make header and card chrome follow the UI version (Next changes; Legacy identical)
- **Files owned:** `AppHeader.tsx`, `StackScreenHeader.tsx`, `ListCard.tsx`. Move the tone palette and StyleSheets to `useThemedStyles` (factory reads theme only), with no new abstraction.
- **Callers affected:** the 6 `StackScreenHeader` users, `PageHeader` (Home), and the 4 `ListCard` rows. Callers are not edited.
- **Unchanged by contract:** Legacy output, because the runtime Legacy theme has the same values as the static one. Props and APIs are also unchanged.
- **Tests:** extend `PageHeader.test.tsx` and add `ListCard`/`AppHeader` render tests. Assert background and border colours equal `resolveTheme('legacy')` normally, and `resolveTheme('next')` when wrapped in `UiVersionOverride value="next"`.
- **Later gates:**
  - Legacy device screenshots before and after must show no difference.
  - Next screenshots get reviewed against **Figma** frames, not Lovable.
  - `TabBar`, `SettingsListRow` and `UserSettingsMenu` follow as a separate batch.

### Batch 3 — merge duplicate status colours (Legacy visual change; needs a decision first)
- **Files owned:** `tokens.ts`, `RecordingCloudIcon.tsx`, `BibleTab.tsx:49`.
- **Change:** point `syncSynced`/`syncUnsynced` usages and the hand-picked badge colours at a single family each (the `syncStatus*` values and `workflowStages`), then remove the deprecated duplicates.
- **Unchanged by contract:** Next colour mapping, the sync state logic, and the Prepare Offline and auth success meaning.
- **Prerequisite:** Matt or design confirms which family is canonical. The declared CSS favours `syncStatus*`.
- **Tests:** update the Legacy snapshot intentionally (reviewed diff), plus `RecordingCloudIcon`/`CloudSyncStatusIcon` tests.
- **Later gate:** device screenshots of Bible tab, Prepare Offline and the take rows in every sync state.

Radius (finding D), disabled opacity (finding E) and font are **not** batched. Each changes Legacy visuals and needs reference evidence first.

---

## 5. Blockers to a one-to-one visual comparison, and next action

1. **No rendered reference.** I have the HTML/CSS shell only. A one-to-one comparison needs screenshots of the mock captured by Matt or another tool, at a fixed viewport (for example 412×915 dp), with seeded data equivalent to the app's.
2. **Reference version unknown.** Someone needs to confirm whether the live site matches `4727043` / `d12434c`, or export screenshots from that commit.
3. **Route mapping.** We need a mock-screen to app-screen/state map, which the inventory worker could provide.
4. **Device captures.** Android screenshots per screen and state are needed in **Legacy**. Next must be compared against Figma frame exports instead.
5. **Font decision.** Until IBM Plex Sans vs System is settled, every text comparison will differ.
6. **Design decisions** on the canonical sync colours (Batch 3), the card radius (8 vs 12) and disabled opacity.

**Proposed next action:** implement Batch 1 on a ticketed branch, since it has zero visual change and only needs typecheck plus existing tests. In parallel, ask Matt for the reference screenshots and the font decision.
