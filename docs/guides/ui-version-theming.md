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
| `src/theme/nextFoundation.ts` | Next spacing, radius, type scale, motion, opacity, control sizes |
| `src/theme/next.ts` | Per-mode `nextThemes` (Canvas / Hardware / Accent) + deep-merge + layout derive |
| `src/theme/legacyRoles.ts` | Nearest Legacy colors for the Foundations role names (`theme.roles` in Legacy) |
| `src/theme/elevation.ts` | Effect styles as `boxShadow` strings, built from roles |
| `src/theme/uiVersionTypes.ts` | `UiVersion`, `DEFAULT_UI_VERSION`, `isUiVersion`, `ColorMode`, `DEFAULT_COLOR_MODE` (no theme object imports) |
| `src/theme/uiVersion.ts` | `resolveTheme()` |
| `src/theme/useTheme.ts` | `useUiVersion()`, `useTheme()`, `useThemedStyles()` — import from this module (not the `theme` barrel) so static consumers stay free of preference/storage |
| `src/services/userPreferences.ts` | Device-level `pref_ui_version` (default `legacy`) |

Settings → **Interface → UI version** toggles the preference. No app restart.

## Figma source (Next)

Foundations page: [ETEN × Fluent · Foundations](https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2308-6)

| Mode | Use |
| --- | --- |
| **Hardware** (default) | App chrome — lists, settings, drawers. Mapped onto `Theme` via `nextTheme`. |
| **Canvas** | Dark reading / drafting / recording surface — wrap the subtree in `<ColorModeScope value="canvas">` |
| **Accent** | Blue note overlays — `<ColorModeScope value="accent">` |

Do **not** import `src/theme/next*` from app/UI code (ESLint bans `theme/next`). Use `useTheme()` / `resolveTheme(version, mode)`. To render part of a screen in Canvas or Accent, wrap it in `ColorModeScope` (from `src/theme/useTheme`); everything below resolves that mode's `roles`, `elevation` and mapped `colors`. Hardware is the default, and Legacy ignores modes. Set status / nav bar icon style per screen to match (light icons on Canvas).

### Foundations groups on `Theme`

For Next components, `Theme` also carries `roles` (Foundations role names,
Hardware in Next, nearest Legacy colors in Legacy), `elevation` (effect
styles as `boxShadow` strings built from roles), `motion`, `opacity` and
`controlSizes`, plus `radius.xs`. They're added in `legacy.ts` and overridden
in `next.ts`; `tokens.ts` is untouched.

### Unmapped Foundations steps

Kept accessible on `nextSpace` / `nextRadiusScale` but not on `Theme` keys yet:

- `space-32`
- Not encoded yet: `space-48`, gradients, `stroke/*` (follow-up)

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
6. **`useThemedStyles` factory must be theme-only.** The hook memos on the
   active theme identity, not on `factory`. Closing over props or other state
   leaves those values stale until the UI version changes. Read props outside
   the factory and merge into the returned styles if needed.

## Adding Next tokens

1. Prefer updating `nextPrimitives` / `nextRoles` / `nextFoundation`, then the
   Hardware map in `next.ts` — not `tokens.ts`.
2. Overrides deep-merge into nested groups (`typography.sizes.lg` does not
   require restating every sibling key). After merge, `homeListContent`,
   `listCard`, and `headerLayout` are re-derived from the resolved
   colors/spacing/radius so derived layout stays in sync.
3. If you need a **new** `Theme` key, add it to the Legacy theme with today's
   value first, then override in Next — keeps `Theme` one shape.
4. `iconSizes` and stroke-width constants in `iconSpecs.ts` are still
   Legacy-only (not on `Theme`). Add them to `Theme` before overriding for Next.
5. Migrate any StyleSheet that must show the new value onto `useThemedStyles`
   (module-level `StyleSheet.create({ …theme })` will not pick up Next).

## Building Next components from Figma

Follow [figma-to-component.md](figma-to-component.md) (agents: the
`figma-component` skill). Known gaps between this theme and Figma are tracked
in [theme-figma-audit.md](../features/next-ui-redesign/theme-figma-audit.md).

## Deleting Legacy later

1. Fold Next overrides / primitives / roles / foundation into the token files
   (`next.ts`, `nextPrimitives.ts`, `nextRoles.ts`, `nextFoundation.ts`).
2. Remove `uiVersion` preference, Settings row, and dual resolution.
3. Keep `useTheme()` as a thin alias of the single theme if useful, or delete it.

## Tests

- `src/theme/legacyTheme.test.ts` — Legacy snapshot + Next mapping per mode + roles/elevation.
- `src/theme/useTheme.test.tsx` — runtime switch + `useThemedStyles` + `ColorModeScope`.
- `src/services/userPreferences.test.ts` — default / persist / invalid fallback.
