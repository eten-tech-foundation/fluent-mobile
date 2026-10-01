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
| `src/theme/next.ts` | Next overrides merged onto Legacy (no blind full-copy) |
| `src/theme/uiVersionTypes.ts` | `UiVersion`, `DEFAULT_UI_VERSION`, `isUiVersion` (no theme object imports) |
| `src/theme/uiVersion.ts` | `resolveTheme()` |
| `src/theme/useTheme.ts` | `useUiVersion()`, `useTheme()`, `useThemedStyles()` — import from this module (not the `theme` barrel) so static consumers stay free of preference/storage |
| `src/services/userPreferences.ts` | Device-level `pref_ui_version` (default `legacy`) |

Settings → **Interface → UI version** toggles the preference. No app restart.

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

1. Add overrides in `src/theme/next.ts` (`nextOverrides`), not in `tokens.ts`.
2. If you need a **new** token key, add it to the Legacy theme with today's
   value first, then override in Next — keeps `Theme` one shape.
3. Migrate any StyleSheet that must show the new value onto `useThemedStyles`
   (module-level `StyleSheet.create({ …theme })` will not pick up Next).

## Deleting Legacy later

1. Fold Next overrides into the token files.
2. Remove `uiVersion` preference, Settings row, and `next.ts` / dual resolution.
3. Keep `useTheme()` as a thin alias of the single theme if useful, or delete it.

## Tests

- `src/theme/legacyTheme.test.ts` — snapshot guards accidental Legacy drift.
- `src/theme/useTheme.test.tsx` — runtime switch + `useThemedStyles`.
- `src/services/userPreferences.test.ts` — default / persist / invalid fallback.
