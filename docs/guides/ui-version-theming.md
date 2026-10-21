# UI version theming (Legacy / Next)

Engineering theme contract (not product AC for recording/sync). Current matching-design phase updated 2026-10-20.
Figma gap audit (dated): [theme-figma-audit.md](../features/next-ui-redesign/theme-figma-audit.md).

Original Lovable source review and current issue ownership:
[dated review and evidence map](../features/next-ui-redesign/lovable-review.md).
Source/token evidence does not establish rendered visual fidelity.

Fluent Mobile supports a runtime-selectable **UI version** while the redesign
lands:

| Version | Meaning |
| --- | --- |
| `legacy` | Current shipped design (default, safe) |
| `next` | Temporary Legacy-appearance placeholder with independently owned tokens; future redesign evolves separately |

Next currently uses the Legacy appearance as a temporary placeholder, including
its Hardware, Canvas and Accent modes. Matching values describe this phase,
not a permanent requirement that the themes match or evidence of rendered
fidelity to the live Lovable reference.
Next owns its baseline data independently: editing Legacy does not silently
change Next, and editing one Next mode does not change another.

This is **not** light/dark mode. Prefer structural/token changes over scattering
`isNextUI ? … : …` checks.

## Where things live

| Path | Role |
| --- | --- |
| `src/theme/tokens.ts`, `layout.ts`, `iconSpecs.ts` | **Legacy** source tokens (frozen baseline) |
| `src/theme/legacy.ts` | Assembled `legacyTheme` (+ static `theme` alias) |
| `src/theme/nextBaseline.ts` | Independently owned current-look Next token data; no Legacy runtime imports |
| `src/theme/nextPrimitives.ts` | Retained future Next color ramps (bone / blue / red) from Figma |
| `src/theme/nextRoles.ts` | Retained future Canvas / Hardware / Accent semantic role inputs |
| `src/theme/nextFoundation.ts` | Retained future Next spacing, radius, type, motion and control-size inputs |
| `src/theme/next.ts` | Per-mode independent deep copies of `nextBaseline`; current modes share values, not object references |
| `src/theme/legacyRoles.ts` | Nearest Legacy colors for the Foundations role names (`theme.roles` in Legacy) |
| `src/theme/elevation.ts` | Effect styles as `boxShadow` strings, built from roles |
| `src/theme/uiVersionTypes.ts` | `UiVersion`, `DEFAULT_UI_VERSION`, `isUiVersion`, `ColorMode`, `DEFAULT_COLOR_MODE` (no theme object imports) |
| `src/theme/uiVersion.ts` | `resolveTheme()` |
| `src/theme/useTheme.ts` | `useUiVersion()`, `useTheme()`, `useThemedStyles()` — import from this module (not the `theme` barrel) so static consumers stay free of preference/storage |
| `src/services/userPreferences.ts` | Device-level `pref_ui_version` (default `legacy`) |

Settings → **Interface → UI version** toggles the preference. No app restart.
`UiVersionPreferenceProvider` at the application root bridges persistent
preferences into the presentation context. Shared components import only the
storage-free `useTheme` hooks; standalone components without a provider default
to Legacy. Subtree `UiVersionOverride` values take precedence within that root.
Preference-driven integration tests should mount the real root provider.

## Figma source (future Next divergence)

Foundations page: [ETEN × Fluent · Foundations](https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2308-6)

| Mode | Use |
| --- | --- |
| **Hardware** (default) | Current-design app chrome; independent `nextThemes.hardware` |
| **Canvas** | Current-design values today; retained API for a future reading / drafting surface |
| **Accent** | Current-design values today; retained API for future note overlays |

Do **not** import `src/theme/next*` from app/UI code (ESLint bans `theme/next`). Use `useTheme()` / `resolveTheme(version, mode)`. To render part of a screen in Canvas or Accent, wrap it in `ColorModeScope` (from `src/theme/useTheme`); everything below resolves that mode's `roles`, `elevation` and mapped `colors`. Hardware is the default, and Legacy ignores modes. Set status / nav bar icon style to match the resolved surface; do not assume Canvas is dark while it uses the Legacy placeholder.

### Foundations groups on `Theme`

For Next components, `Theme` also carries `roles` (Foundations role names,
Hardware by default, nearest Legacy colors in Legacy), `elevation` (effect
styles as `boxShadow` strings built from roles), `motion`, `opacity`,
`controlSizes` and `stroke`, plus `radius.xs` and `spacing.xxs`. They're
present in `legacy.ts` and independently represented in `nextBaseline.ts`;
`tokens.ts` is untouched.

### Unmapped Foundations steps

Kept accessible on `nextSpace` / `nextRadiusScale` but not on `Theme` keys yet:

- `space-32`
- Not encoded yet: `space-48`, gradients (follow-up)

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

1. Change Next values in `nextBaseline.ts`, not Legacy `tokens.ts`.
2. Keep `Theme` one shape: add a new key to Legacy with today's value and
   explicitly add it to the independently owned Next baseline.
3. Layout values in the current baseline are explicit. If changing spacing,
   radius or colors, review corresponding `listCard`, `homeListContent` and
   `headerLayout` values together; there is no implicit Legacy merge.
4. Migrate StyleSheets that need runtime differences to `useThemedStyles`.
   AppHeader, StackScreenHeader, header safe-area padding and ListCard now use
   the resolved theme. Other static consumers remain Legacy-pinned until
   deliberately migrated.
5. To resume Figma mode differentiation, explicitly map the retained
   primitives/roles/foundation inputs into the selected Next mode. Keep deep
   object ownership separate from Legacy and the other modes; do not restore
   runtime inheritance of Legacy data.
   The current parity test deliberately pins matching values for this phase.
   When Next deliberately diverges, update that assertion to the approved
   Next values while retaining every nested ownership/isolation check.
   Do not synchronize a Legacy edit into Next just to satisfy the parity test.
6. `iconSizes` and stroke-width constants in `iconSpecs.ts` are still shared
   current-design values, not independently configurable `Theme` keys. Add
   them to the theme shape before intentionally varying them by UI version.

## Future Next components from Figma

Follow [figma-to-component.md](figma-to-component.md) (agents: the
`figma-component` skill). Known gaps between this theme and Figma are tracked
in [theme-figma-audit.md](../features/next-ui-redesign/theme-figma-audit.md).

## Deleting Legacy later

1. Fold the Next baseline / primitives / roles / foundation into the token files
   (`nextBaseline.ts`, `nextPrimitives.ts`, `nextRoles.ts`, `nextFoundation.ts`).
2. Remove `uiVersion` preference, Settings row, and dual resolution.
3. Keep `useTheme()` as a thin alias of the single theme if useful, or delete it.

## Tests

- `src/theme/legacyTheme.test.ts` — unchanged Legacy snapshot, deliberate current parity, nested object isolation between Legacy/Next/modes, retained Figma inputs.
- `src/theme/useTheme.test.tsx` — runtime switch + `useThemedStyles` + `ColorModeScope`.
- `src/components/layout/SharedChromeTheme.test.tsx` — runtime chrome divergence without Legacy bleed.
- `src/services/userPreferences.test.ts` — default / persist / invalid fallback.
