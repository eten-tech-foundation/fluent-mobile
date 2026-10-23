# Next theme vs Figma Foundations audit

Audited 2026-10-05 against `origin/main` at `4a10ff1` (after #616 and #618).
Status updated 2026-10-07 for #638, which resolved most of it. Each section
says whether it's **resolved** or **open**; the open items are collected in
[Still open](#still-open) at the end.

Figma source: [ETEN × Fluent · Foundations](https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2308-6),
read straight from the file's variable collections (`Primitives`, `Roles`), local
text styles, effect styles and paint styles via the Figma Plugin API. That's the
source of truth here, not the swatch labels on the page.

## Summary

The color work in #618 was accurate: every primitive matched, and 46 of 48
role values matched across Canvas, Hardware and Accent. The audit found a
two-value role mismatch, typography that had drifted, and Foundations tokens
(motion, elevation, sizes, strokes, gradients) that weren't encoded.

**Now (after #638 and #692):** all 48 role values match, the roles,
elevation, motion, disabled opacity, icon sizes, strokes, `radius.xs` and
`space/2` are on `Theme` in all three modes, and components reach them
through `useTheme()`. The named type styles are on `Theme` too. Still open:
the font family, gradients and `space/48`.

## What matches

| Group | Figma | Code | Result |
| --- | --- | --- | --- |
| Color primitives (bone, blue, red ramps + white/black) | 35 | `nextPrimitives` | All match |
| Opacity stops (0, 8, 12, 16, 24, 32, 40) | 7 | `nextPrimitives.opacity` | All match |
| Space steps | 8 | `nextSpace` | 7 of 8 (`space/48` open) |
| Radius (xs, sm, md, lg, full) | 5 | `nextRadiusScale` | All match |
| Roles, Hardware mode | 16 + 5 alpha | `nextColorRoles.hardware` | All match |
| Roles, Canvas and Accent | 16 + 5 alpha each | `nextColorRoles.*` | All match (`accent/record` fixed in #638) |
| `bg/clear`, `shadow/*` composites | `bg/default` @ 0, black @ 32/24/12/8 | `withAlpha(...)` | Match |
| Legacy bridge (`Legacy / Fluent Blue` → `blue/700`) | `#0B50D0` | `colors.primary` | Match |

## Outliers

### 1. `accent/record` was wrong in two modes (resolved in #638)

| Mode | Figma | Code before | Code now |
| --- | --- | --- | --- |
| Canvas | `red/500` `#FB4744` | `red[600]` | `red[500]` |
| Hardware | `red/600` `#E11825` | `red[600]` | `red[600]` |
| Accent | `red/300` `#FDA298` | `red[600]` | `red[300]` |

### 2. Typography had drifted (styles encoded; family still open)

- **Family.** Figma styles now use Google Sans Flex (sans), DM Mono (mono) and
  Noto Sans Telugu, still labeled "Family is TBD … placeholders". Code uses
  `System`, and the `nextFoundation.ts` comment still says "Inter placeholder".
  Someone needs to confirm whether these three are the real families before
  we load fonts. If they are, note that RN on Android doesn't drive variable
  font axes, so Google Sans Flex needs static weight files (400/500/600/700)
  registered as separate families through `expo-font`.
- **Missing styles (resolved).** All 9 styles are on `Theme` as
  `theme.type.*` (`reading`, `readingStrong`, `heading`, `lead`, `title`,
  `body`, `label`, `overline`, `meta`), built in `src/theme/typeStyles.ts`,
  with the Telugu line heights as `theme.typeTelugu.*`. Sans styles set no
  family (a named but unloaded family drops 500/600 to regular on Android),
  and mono uses `monospace`, which only renders 400 and 700 until DM Mono is
  loaded.
- **Figma-side rules (resolved):** every style sets `includeFontPadding:
  false`, overline and meta carry `textTransform: 'uppercase'`, and Reading's
  1.3× cap is `theme.fontScale.readingMax` (a `Text` prop, not a style).
- **`overline` still overrides `typography.sizes.xl`** in Next, so Legacy-keyed
  text using `xl` becomes a 20px overline without being monospaced. New code
  should use `theme.type.overline`; the old mapping can go once nothing reads
  it.

### 3. Foundations tokens that weren't encoded (mostly resolved in #638)

| Figma | Value | Use (from Figma) | Status |
| --- | --- | --- | --- |
| `space/48` | 48 | Screen top inset. Use safe-area insets in code, not a constant | Open |
| `size/icon-24`, `size/icon-32` | 24, 32 | Round buttons and rows; keys and mini player | `theme.controlSizes` |
| `stroke/1`, `stroke/2` | 1, 2 | Rim on screen buttons; bevel edges on hardware | `theme.stroke[1]`, `[2]` (#692) |
| `opacity/disabled` | → `opacity/40` | Disabled controls | `theme.opacity.disabled` |
| `motion/press` | 80 ms | Press-in | `theme.motion.pressMs` |
| `motion/release` | 180 ms | Release to rest | `theme.motion.releaseMs` |
| `motion/ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Press and release easing | `theme.motion.easeStandard` |
| `elevation/raised` | 3 layers, bound to `border/highlight`, `border/shadow`, `shadow/cast` | Hardware keys, switch knob | `theme.elevation.raised` |
| `elevation/inset` | 3 layers, bound to `shadow/cast`, `shadow/edge`, `border/highlight` | Pressed keys, switch track, speaker holes | `theme.elevation.inset` |
| `elevation/soft` | 4 layers, bound to highlight/shadow/dish | Round button, Style=Soft (light screens) | `theme.elevation.soft` |
| `elevation/floating` | `0 4 20` `shadow/float` | Overlays above scrolling content | `theme.elevation.floating` |
| `fade/reading` | `bg/clear` → `bg/default` | Overlay on upcoming text | Open |
| `gradient/accent` | `surface/sunken` → `bg/default` | Note overlay background | Open |
| `Fluent Gradient` (paint style) | `blue/800` → `blue/700` | Brand moments | Open |

The elevation effect styles are bound to role variables, so code builds them
from roles per mode (`src/theme/elevation.ts`). On Android, RN draws outset
shadows from API 28 and inset shadows from API 29, and the app's
`minSdkVersion` is 24, so keys render flat on older devices.

### 4. App code couldn't reach most roles (resolved in #638)

`next.ts` maps 13 Hardware roles onto Legacy-shaped `Theme.colors` keys, and
ESLint bans importing `theme/next` from UI. So these roles had no path into a
component before #638: `surface/highlight`, `surface/sunken`, `surface/inverse`,
`surface/inverse-muted`, `fg/on-inverse`, `border/highlight`,
`border/shadow`, `shadow/*`, and every Canvas or Accent value.

Every tactile component in Figma (keys, switch, round button) uses at least
three of those. **Resolved:** `theme.roles` now carries every role name, in
all three modes through `ColorModeScope`, with nearest Legacy values so
components never branch.

### 5. Minor (open)

- `Theme.spacing.xl` (20) has no Foundations step. Already documented.
- Next `radius.md` is 16 and `lg` is 24 (Legacy 12 / 16). Intended, but any
  Legacy-keyed component flipped to Next will round more than it does today.

## Still open

In dependency order:

1. **Typography family.** The named styles are encoded; confirm the families
   (Google Sans Flex / DM Mono / Noto Sans Telugu are placeholders), then load
   them with `expo-font` and change `nextFontFamilies` in `nextFoundation.ts`.
2. **Gradients.** `fade/reading`, `gradient/accent`, `Fluent Gradient`, plus
   `space/48`.
