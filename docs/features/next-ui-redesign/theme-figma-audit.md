# Next theme vs Figma Foundations audit

> **Dated Figma audit.** Snapshot vs Foundations (see dates in body). Engineering theme contract: [ui-version-theming.md](../../guides/ui-version-theming.md). Not recording/sync product AC.

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
gradients and `space/48`, plus the places code now departs
from Figma (§6) that Figma needs to follow.

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

### 2. Typography had drifted (resolved)

- **Family (resolved).** Next uses Plus Jakarta Sans and Atkinson Hyperlegible
  Next, loaded with `expo-font` (open-questions Q1, #891). Figma still shows
  Google Sans Flex and DM Mono, noted in the v2 manifest's Figma follow-ups.
- **Missing styles (resolved).** All 9 styles are on `Theme` as
  `theme.type.*` (`reading`, `readingStrong`, `heading`, `lead`, `title`,
  `body`, `label`, `overline`, `meta`), built in `src/theme/typeStyles.ts`,
  with the Telugu line heights as `theme.typeTelugu.*`. Legacy sets no sans
  family and uses `monospace` for overline and meta.
- **Figma-side rules (resolved):** every style sets `includeFontPadding:
  false`, Legacy's overline and meta carry `textTransform: 'uppercase'`, and Reading's
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
| `Icon/md` (icon library) | 20 | Mode toggle icons | `theme.controlSizes.icon20` (#695) |
| `stroke/1`, `stroke/2` | 1, 2 | Rim on screen buttons; bevel edges on hardware | `theme.stroke[1]`, `[2]` (#692) |
| `opacity/disabled` | → `opacity/40` | Disabled controls | `theme.opacity.disabled` |
| `motion/press` | 80 ms | Press-in | `theme.motion.pressMs` |
| `motion/release` | 180 ms | Release to rest | `theme.motion.releaseMs` |
| `motion/ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Press and release easing | `theme.motion.easeStandard` |
| `elevation/raised` | 3 layers, bound to `border/highlight`, `border/shadow`, `shadow/cast` | Hardware keys, switch knob | `theme.elevation.raised` |
| `elevation/inset` | 3 layers, bound to `shadow/cast`, `shadow/edge`, `border/highlight` | Pressed keys, switch track, speaker holes | `theme.elevation.inset` |
| `elevation/soft` | 4 layers, bound to highlight/shadow/dish | Round button, Style=Soft (light screens) | `theme.elevation.soft` |
| `elevation/floating` | `0 4 20` `shadow/float` | Overlays above scrolling content | `theme.elevation.floating` |
| `fade/reading` | `bg/clear` → `bg/default` | Overlay on upcoming text | `theme.fade.reading` |
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

### 6. Code departs from Figma (open, Figma to follow)

Decided in code first (code over Figma); the Figma file needs the same
change. All from #873.

| What | Figma | Code |
| --- | --- | --- |
| The player's reading size | Script and listening materials in `type/reading` (42/52), notes in `type/lead` (32/40) | All three in `type/lead` (32/40), so the player reads at one size and more fits on screen; `type/reading` stays for read-along elsewhere |
| Verse numbers in the script | `type/label` (14) | `type/title` (18), a little larger at the new reading size, raised in the player so its top meets the capitals |
| Word, Note style | Not a Word style | A phrase with a translation note at rest: `fg/primary` text in a `stroke/2` `accent/primary` outline, `radius/xs`; touching words of a phrase square their corners and drop the shared border. In Record, where notes don't open, the outline is `fg/inactive` and the focused phrase drops its fill |
| Word, Phrase style | `accent/primary` fill | Adds a `stroke/2` border in the fill's color, so Phrase and Note are one size and swap without reflow |
| Word chips in running text | Separate boxes laid out with `space/4` gaps | Inline in the script's text, a `space/4` + border shorter than the line and dropped 0.2 em onto the baseline (Android sits an inline view's bottom on it) |
| Round button, Flat | Pinned to Canvas | Canvas, or Accent on a blue (Accent) screen, matching its description ("Flat = black and blue screens") |

### 7. Code ahead of Figma (open)

Built in code with no Figma frame yet. Each needs a frame to match or replace.

- **Verse mode (Q31, 2026-11-03).** The Verses list under the passage hero
  (Progress ring with a check, or the verse number while unrecorded), and
  the open player's verse pages in Listen and Record: one row at the left,
  Page dots with the current verse's Verse chip in place of its dot, or past
  12 verses the chip and "of 71", above the verse at reading size, kept apart
  from the take card so it doesn't read as paging takes. In verse mode the hero's recorded verse numbers use
  `accent/primary`. Without verse timings the Listen waveform drops its verse
  chips (Q32).
  In verse mode a passage take over the verse gets a fan tile that can't be
  deleted there, and its card reads "Passage take 1 · v. 1–7". The take card names its unit ("Passage take 2", "v. 23 · Take 1"),
  where Figma reads "Take 2". Copy for the passage-take line on the take card, the confirms before
  recording over a passage take or over verse takes, and the pericope-mode
  take card for verses recorded on their own ("Recorded verse by verse") is
  code's too.

## Still open

1. **Gradients.** `gradient/accent`, `Fluent Gradient`, plus `space/48`.
   `fade/reading` is encoded like the elevation styles, built from roles
   (`src/theme/gradients.ts`).
