# UI version theming (Legacy / Next)

Fluent Mobile supports a runtime-selectable **UI version** while the redesign
lands:

| Version | Meaning |
| --- | --- |
| `legacy` | Current shipped design (default, safe) |
| `next` | Redesign surface — evolves independently |

This is **not** light/dark mode. Prefer structural/token changes over scattering
`isNextUI ? … : …` checks.

## Where things live

| Path | Role |
| --- | --- |
| `src/theme/tokens.ts`, `layout.ts`, `iconSpecs.ts` | **Legacy** source tokens (frozen baseline) |
| `src/theme/legacy.ts` | Assembled `legacyTheme` (+ static `theme` alias) |
| `src/theme/nextPrimitives.ts` | Next color ramps (bone / blue / red) from Figma |
| `src/theme/nextRoles.ts` | Canvas / Hardware / Accent semantic roles |
| `src/theme/nextFoundation.ts` | Next spacing, radius, type scale |
| `src/theme/next.ts` | Hardware→`Theme` bridge + `nextTheme` |
| `src/theme/uiVersionTypes.ts` | `UiVersion`, `DEFAULT_UI_VERSION`, `isUiVersion` (no theme object imports) |
| `src/theme/uiVersion.ts` | `resolveTheme()` |
| `src/theme/useTheme.ts` | `useUiVersion()`, `useTheme()`, `useThemedStyles()` — import from this module (not the `theme` barrel) so static consumers stay free of preference/storage |
| `src/services/userPreferences.ts` | Device-level `pref_ui_version` (default `legacy`) |

Settings → **Interface → UI version** toggles the preference. No app restart.

## Figma source (Next)

Foundations page: [ETEN × Fluent · Foundations](https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2308-6)

| Mode | Use |
| --- | --- |
| **Hardware** (default) | App chrome — lists, settings, drawers. Mapped onto `Theme` via `nextTheme`. |
| **Canvas** | Dark reading / drafting surface — available as `nextColorRoles.canvas` for future screens |
| **Accent** | Blue note overlays — `nextColorRoles.accent` |

Do **not** import `src/theme/next*` from app/UI code (ESLint bans `theme/next`). Use `useTheme()` / `resolveTheme()` for Hardware-mapped values. For Canvas/Accent in a future screen, export a small resolver from `src/theme` (or extend `useTheme`) rather than importing role tables in screens.

### Unmapped Foundations steps

Kept accessible on `nextSpace` / `nextRadiusScale` but not on `Theme` keys yet:

- `space-2`, `space-32`
- `radius-xs` (4)
- Effects / tactile / gradients (follow-up)

`Theme.spacing.xl` (20) has no Foundations step — left at 20 until design assigns one.

## Consumer rules

1. **Static `theme` / named token imports** — Legacy presentation only. Values
   are fixed at module load (`StyleSheet.create` at module scope stays Legacy).
2. **Runtime-aware UI** — use `useTheme()` or `useThemedStyles(theme => ({…}))`.
   These re-render when the preference changes.
3. **Never import `src/theme/next` from app/UI code** — ESLint bans it. Reach
   Next values only through `useTheme()` / `resolveTheme()`.
4. **Avoid spreading** `uiVersion === 'next' ? … : …` through the tree. Prefer
   token-driven differences; for structural splits, branch once at a screen or
   section boundary.
5. **Do not fork** domain behavior (sync, recording, DB, auth, etc.) by UI
   version.

## Adding Next tokens

1. Prefer updating `nextPrimitives` / `nextRoles` / `nextFoundation`, then the
   Hardware map in `next.ts` — not `tokens.ts`.
2. If you need a **new** `Theme` key, add it to the Legacy theme with today's
   value first, then override in Next — keeps `Theme` one shape.
3. Migrate any StyleSheet that must show the new value onto `useThemedStyles`
   (module-level `StyleSheet.create({ …theme })` will not pick up Next).

## Deleting Legacy later

1. Fold Next overrides / primitives / roles / foundation into the token files
   (`next.ts`, `nextPrimitives.ts`, `nextRoles.ts`, `nextFoundation.ts`).
2. Remove `uiVersion` preference, Settings row, and dual resolution.
3. Keep `useTheme()` as a thin alias of the single theme if useful, or delete it.

## Tests

- `src/theme/legacyTheme.test.ts` — Legacy snapshot + Next Hardware mapping.
- `src/theme/useTheme.test.tsx` — runtime switch + `useThemedStyles`.
- `src/services/userPreferences.test.ts` — default / persist / invalid fallback.
