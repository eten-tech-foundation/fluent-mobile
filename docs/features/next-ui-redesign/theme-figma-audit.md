# Next theme vs Figma Foundations audit

Audited 2026-10-05 against `origin/main` at `4a10ff1` (after #616 and #618).

Figma source: [ETEN × Fluent · Foundations](https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2308-6),
read straight from the file's variable collections (`Primitives`, `Roles`), local
text styles, effect styles and paint styles via the Figma Plugin API. That's the
source of truth here, not the swatch labels on the page.

## Summary

The color work in #618 is accurate. Every primitive matches, and 46 of 48 role
values match across Canvas, Hardware and Accent. The outliers are a two-value
role mismatch, typography that's drifted since it was transcribed, and a set of
Foundations tokens (motion, elevation, sizes, strokes, gradients) that aren't
encoded yet. Those missing tokens matter most for component work, because
nearly every interactive component in Figma uses them.

## What matches

| Group | Figma | Code | Result |
| --- | --- | --- | --- |
| Color primitives (bone, blue, red ramps + white/black) | 35 | `nextPrimitives` | All match |
| Opacity stops (0, 8, 12, 16, 24, 32, 40) | 7 | `nextPrimitives.opacity` | All match |
| Space steps | 8 | `nextSpace` | 7 of 8 (see below) |
| Radius (xs, sm, md, lg, full) | 5 | `nextRadiusScale` | All match |
| Roles, Hardware mode | 16 + 5 alpha | `nextColorRoles.hardware` | All match |
| Roles, Canvas and Accent | 16 + 5 alpha each | `nextColorRoles.*` | All but `accent/record` |
| `bg/clear`, `shadow/*` composites | `bg/default` @ 0, black @ 32/24/12/8 | `withAlpha(...)` | Match |
| Legacy bridge (`Legacy / Fluent Blue` → `blue/700`) | `#0B50D0` | `colors.primary` | Match |

## Outliers

### 1. `accent/record` is wrong in two modes (fix)

| Mode | Figma | Code |
| --- | --- | --- |
| Canvas | `red/500` `#FB4744` | `red[600]` `#E11825` |
| Hardware | `red/600` `#E11825` | `red[600]` (match) |
| Accent | `red/300` `#FDA298` | `red[600]` `#E11825` |

Not visible yet because only Hardware is mapped onto `Theme`, but the record
surface is on Canvas, so the first record component built for Next would ship
the wrong red. One-line fix per mode in `nextRoles.ts`.

### 2. Typography has drifted (decision needed)

- **Family.** Figma styles now use Google Sans Flex (sans), DM Mono (mono) and
  Noto Sans Telugu, still labeled "Family is TBD … placeholders". Code uses
  `System`, and the `nextFoundation.ts` comment still says "Inter placeholder".
  Someone needs to confirm whether these three are the real families before
  we load fonts. If they are, note that RN on Android doesn't drive variable
  font axes, so Google Sans Flex needs static weight files (400/500/600/700)
  registered as separate families through `expo-font`.
- **Missing styles.** Figma has 9 styles plus 6 Telugu. Code encodes 4
  (`reading`, `title`, `label`, `overline`). Missing: `reading-strong` 42/52
  700, `heading` 42/48 700, `lead` 32/40 400, `body` 18/24 400, `meta` (mono)
  14/20 400, and all `telugu/*` styles (which use taller line heights, e.g.
  reading 42/64).
- **`overline` is mono.** It's mapped onto `typography.sizes.xl` and
  `weights.medium`, so any Legacy-keyed text using `xl` turns into a 20px
  "overline" in Next without being monospaced. It reads better as its own
  named style than as a size-scale override.
- **Figma-side rules not in code:** `includeFontPadding: false` on every style,
  `maxFontSizeMultiplier: 1.3` on Reading, casing lives in the style (overline,
  meta) rather than typed caps.

### 3. Foundations tokens that aren't encoded

| Figma | Value | Use (from Figma) |
| --- | --- | --- |
| `space/48` | 48 | Screen top inset. Use safe-area insets in code, not a constant |
| `size/icon-24`, `size/icon-32` | 24, 32 | Round buttons and rows; keys and mini player |
| `stroke/1`, `stroke/2` | 1, 2 | Rim on screen buttons; bevel edges on hardware |
| `opacity/disabled` | → `opacity/40` | Disabled controls |
| `motion/press` | 80 ms | Press-in |
| `motion/release` | 180 ms | Release to rest |
| `motion/ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Press and release easing |
| `elevation/raised` | 3 layers, bound to `border/highlight`, `border/shadow`, `shadow/cast` | Hardware keys, switch knob |
| `elevation/inset` | 3 layers, bound to `shadow/cast`, `shadow/edge`, `border/highlight` | Pressed keys, switch track, speaker holes |
| `elevation/soft` | 4 layers, bound to highlight/shadow/dish | Round button, Style=Soft (light screens) |
| `elevation/floating` | `0 4 20` `shadow/float` | Overlays above scrolling content |
| `fade/reading` | `bg/clear` → `bg/default` | Overlay on upcoming text |
| `gradient/accent` | `surface/sunken` → `bg/default` | Note overlay background |
| `Fluent Gradient` (paint style) | `blue/800` → `blue/700` | Brand moments |

The elevation effect styles are bound to role variables, so they follow the
mode. Code should build them from roles per mode, not hardcode the Canvas
values. Figma's Tactile section already spells out the RN `boxShadow` strings.

### 4. App code can't reach most roles (structural)

`next.ts` maps 13 Hardware roles onto Legacy-shaped `Theme.colors` keys, and
ESLint bans importing `theme/next` from UI. So these roles have no path into a
component today: `surface/highlight`, `surface/sunken`, `surface/inverse`,
`surface/inverse-muted`, `fg/on-inverse`, `border/highlight`,
`border/shadow`, `shadow/*`, and every Canvas or Accent value.

Every tactile component in Figma (keys, switch, round button) uses at least
three of those. Without a sanctioned accessor, the first component will either
hardcode hex (like the local `PlaybackTransportBar` concept does) or break the
lint rule. The guide's rule 3 ("export a small resolver from `src/theme`")
already anticipates this. It just needs doing before component work starts.

### 5. Minor

- `Theme.spacing.xl` (20) has no Foundations step. Already documented.
- `nextFoundation.ts` comment says "Inter placeholder". Stale.
- Next `radius.md` is 16 and `lg` is 24 (Legacy 12 / 16). Intended, but any
  Legacy-keyed component flipped to Next will round more than it does today.

## Status and follow-ups

The Key pilot branch resolves sections 1 and 4 and most of 3:

- `accent/record` now matches Figma in every mode (Canvas `red/500`,
  Hardware `red/600`, Accent `red/300`).
- `theme.roles`, `theme.elevation`, `theme.motion`, `theme.opacity`,
  `theme.controlSizes`, `radius.xs` and `spacing.xxs` come through
  `useTheme()`, in all three modes: `ColorModeScope` puts a subtree in Canvas
  or Accent, Hardware is the default.
- Haptics helper and component gallery (with a Canvas / Hardware / Accent
  mode switcher) are in place.

Still open, in dependency order:

1. **Typography: confirm families, then encode the full style set.** Named
   styles (`reading`, `title`, `label`, `body`, `meta`, …) with
   `includeFontPadding` and `maxFontSizeMultiplier` baked in, Telugu variants,
   fonts via `expo-font`. Blocked on the family decision.
2. **Gradients and strokes.** `fade/reading`, `gradient/accent`, `Fluent
   Gradient`, `stroke/*`, `space/48`.
