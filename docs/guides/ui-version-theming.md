# Theme

One presentation. Route files render the Next screen, and color changes by
**Hardware**, **Canvas**, and **Accent**. Settings has no UI version row, and
the app does not read or write `pref_ui_version`. A key left in KV from an
older install is ignored.

This filename is historical. The dual Legacy/Next version switch, subtree
version overrides, and frozen Legacy screens are gone (#916–#920). Dated
design notes stay in [open questions](../features/next-ui-redesign/open-questions.md)
and the [October 2026 manifest](../features/next-ui-redesign/v2-feature-manifest.md).
Follow this guide and [the Next UI map](../features/next-ui-redesign/README.md).

Original Lovable source review:
[dated review and evidence map](../features/next-ui-redesign/lovable-review.md).
Source and token evidence does not establish rendered visual fidelity.

## Color modes

Foundations page: [ETEN × Fluent · Foundations](https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2308-6)

| Mode | Use |
| --- | --- |
| **Hardware** (default) | App chrome — Home, book, settings, accounts. `resolveTheme()` and the static `theme` export. |
| **Canvas** | Dark reading, drafting, and recording. Wrap that subtree in `<ColorModeScope value="canvas">`. |
| **Accent** | Blue note overlays. `<ColorModeScope value="accent">`. |

`ColorModeScope`, `useTheme()`, and `useThemedStyles()` come from
`src/theme/useTheme`. Hardware is the default when no scope is set. Set status
and navigation bar icon style per screen so Canvas gets light icons.

Do **not** import `src/theme/next*` from app or UI code. ESLint bans
`theme/next` and tells you to use `useTheme()` / `useThemedStyles()`, or the
static `theme` barrel for Hardware module styles. `resolveTheme(mode)` is for
non-UI callers and tests. It takes a color mode, and Hardware when the mode
is omitted.

## Where things live

| Path | Role |
| --- | --- |
| `src/theme/nextBaseline.ts` | Owned baseline copied into every mode. Screen colors and type start here. |
| `src/theme/nextPrimitives.ts` | Next color ramps (bone / blue / red) from Figma |
| `src/theme/nextRoles.ts` | Canvas / Hardware / Accent semantic roles |
| `src/theme/nextFoundation.ts` | Spacing, radius, type scale, motion, opacity, control sizes, font families |
| `src/theme/next.ts` | `nextThemes`: deep-copies the baseline, applies that mode's roles, re-derives layout |
| `src/theme/colorMode.ts` | `ColorMode`, `DEFAULT_COLOR_MODE` (`hardware`) |
| `src/theme/typeStyles.ts` | Named type metrics (`reading` … `meta`) and Telugu line heights |
| `src/theme/elevation.ts` | Effect styles as `boxShadow` strings, built from roles |
| `src/theme/gradients.ts` | Fades (`fade/reading`) as `experimental_backgroundImage` strings, built from roles |
| `src/theme/useTheme.ts` | `ColorModeScope`, `useColorMode()`, `useTheme()`, `useThemedStyles()` |
| `src/theme/index.ts` | Static `theme` (Next Hardware) plus icon specs. Hooks stay out of this barrel so static consumers do not pull React context. |
| `src/theme/tokens.ts` | Workflow stage ids and icon spacing. Not the presentation theme. |
| `src/theme/iconSpecs.ts` | Icon sizes and strokes. Still read from `tokens.ts` spacing. |

`useTheme` does not import preferences. Upload-over-cellular, drafting unit,
gallery, and account controls stay in Settings and their own storage.

## Foundations groups on `Theme`

`Theme` carries `roles`, `elevation`, `fade`, `motion`, `opacity`,
`controlSizes`, `stroke`, the named type styles (`type`, `typeTelugu`,
`fontScale`), `cover` (passage cover status blues), plus `radius.xs` and
`spacing.xxs`. Mode overrides live in `next.ts`. `typeTelugu`, `fontScale`,
and `cover` are shared. Sync and warning colors stay on the baseline until a
redesign defines them (`legacyTheme.test.ts`).

### Unmapped Foundations steps

Kept on `nextSpace` / `nextRadiusScale` and not on every `Theme` key yet:

- `space-32` (`nextSpace[32]`)
- Not encoded yet: `space-48`, some gradients (follow-up in the theme audit)

`Theme.spacing.xl` (20) has no Foundations step and stays 20 until design
assigns one.

## Script typography

Android-only. `app.config.ts` links two `expo-font` families and no iOS font
block:

| Family | Weights linked | Named styles |
| --- | --- | --- |
| `PlusJakartaSans` | 400, 500, 600, 700 | `heading`, `title`, `overline`, `meta` |
| `AtkinsonHyperlegibleNext` | 400, 600, 700 | `reading`, `readingStrong`, `lead`, `body`, `label` |

Each family is linked with every weight it uses. Below API 28, React Native
still picks only regular or bold. `includeFontPadding` is false on these
styles. Next overline and meta use case `none`. Heading and overline line
heights are 54 and 26 so Jakarta descenders fit (Figma's 48 and 24 clip).

The passage player reads scripture at `type.lead` (32 / 40). `type.reading`
(42 / 52) stays the Foundations read-along size. Do not map that 42 onto
`typography.sizes.display`; that key stays the baseline record-timer size.
New text uses `Theme.type`. `typography.sizes.md` (16) and `xs` (12) have no
Foundations style and stay on the baseline.

Telugu uses `theme.typeTelugu`: the same sizes with taller line heights so
stacked conjuncts do not clip (`reading` / `heading` 64, `lead` 48, `title` /
`body` 28). Layer those overrides on Telugu text. The gallery Type entry is
the sample.

## Large text

`theme.fontScale.readingMax` is `1.3`. Scripture and notes pass
`maxFontSizeMultiplier={theme.fontScale.readingMax}`. That caps the glyphs.
Android still scales `lineHeight` by the full system font scale, so cap the
line height by hand:

```text
lineHeight * Math.min(scale, readingMax) / scale
```

`scale` is `useWindowDimensions().fontScale` (see `useScriptMetrics` and
[figma-to-component.md](figma-to-component.md)). Those metrics change when the
system text size changes and are not part of the theme object, so merge them
outside a `useThemedStyles` factory. Other text scales with the system.
Device checks at the largest font and display size are in the QA scenarios
([qa-process.md](qa-process.md#next-nightly-scenarios)).

## Consumer rules

1. **Static `theme`** — Next Hardware, fixed at module load. Use it for chrome
   that does not sit inside a `ColorModeScope`. A module-level
   `StyleSheet.create({ …theme })` will not follow Canvas or Accent.
2. **Scoped UI** — `useTheme()` or `useThemedStyles(theme => ({…}))` inside
   the scope that should recolor.
3. **Never import `src/theme/next` from app/UI code.**
4. **One screen per route.** Branch structure inside a screen when the layout
   differs. Do not add a version check, a second route tree, or a frozen copy
   of a removed screen.
5. **Do not fork** auth, audio, SQLite, sync, downloads, or stage advance
   into a presentation-only copy. Screens call the shared hooks and services.
6. **`useThemedStyles` factory must be theme-only.** The hook memos on the
   active theme identity, not on `factory`. Closing over props or other state
   leaves those values stale until the color mode changes. Read props outside
   the factory and merge.

## Adding tokens

1. Prefer `nextPrimitives` / `nextRoles` / `nextFoundation`, then the mode map
   in `next.ts`. Do not add presentation colors to `tokens.ts`.
2. Overrides deep-merge into nested groups (`typography.sizes.lg` does not
   require restating every sibling key). After merge, `homeListContent`,
   `listCard`, and `headerLayout` are re-derived from the resolved
   colors, spacing, and radius.
3. A new `Theme` key goes on `nextBaseline` first so every mode has the same
   shape, then override it per mode in `next.ts` when the modes differ.
4. `iconSizes` and stroke constants in `iconSpecs.ts` are not on `Theme`. Add
   them to `Theme` before a screen needs them to follow color mode.
5. Move any StyleSheet that must follow Canvas or Accent onto `useThemedStyles`.

## Building components from Figma

Follow [figma-to-component.md](figma-to-component.md) (agents: the
`figma-component` skill). Known gaps between this theme and Figma are tracked
in [theme-figma-audit.md](../features/next-ui-redesign/theme-figma-audit.md).

## Saved links

Old URLs and paused-take markers open this same theme. They are navigation
adapters, documented in the [Next UI map](../features/next-ui-redesign/README.md#saved-links-and-recovery).

## Tests

- `src/theme/legacyTheme.test.ts` — filename kept. Asserts the static `theme`
  is Next Hardware, modes do not share objects, and Foundations mapping.
- `src/theme/useTheme.test.tsx` — `useTheme`, `useThemedStyles`, `ColorModeScope`.
- `src/theme/useTheme.storageIsolation.test.tsx` — presentation theme does not
  import `userPreferences`.
- `src/components/layout/SharedChromeTheme.test.tsx` — chrome follows the
  scoped color mode.
- `src/services/userPreferences.test.ts` — preferences do not write
  `pref_ui_version`.
