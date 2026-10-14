import { buildTypeStyles } from './typeStyles';

/**
 * Next spacing / radius / type scale from Figma Foundations
 * (03 Typography · 04 Spacing · 05 Radius).
 *
 * Font family remains System — Figma marks family as TBD.
 */

/** Figma `space/*` steps (px). */
export const nextSpace = {
  2: 2,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  24: 24,
  32: 32,
} as const;

/** Figma `motion/*`, `opacity/disabled` and `size/*` (04 · Spacing). */
export const nextMotion = {
  pressMs: 80,
  releaseMs: 180,
  easeStandard: { x1: 0.2, y1: 0, x2: 0, y2: 1 },
} as const;

export const nextOpacity = { disabled: 0.4 } as const;

export const nextControlSizes = { icon24: 24, icon32: 32 } as const;

/**
 * Map onto existing `Theme.spacing` keys.
 * Unmapped Figma steps: `space-32` (use `nextSpace` directly when needed);
 * `space-48` isn't encoded yet.
 * `xl` (20) has no Foundations step — kept at 20 until design assigns one.
 */
export const nextSpacing = {
  xxs: nextSpace[2],
  xs: nextSpace[4],
  sm: nextSpace[8],
  md: nextSpace[12],
  lg: nextSpace[16],
  xl: 20,
  xxl: nextSpace[24],
} as const;

/** Figma `radius/*` steps. */
export const nextRadiusScale = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  full: 999,
} as const;

/** Map onto existing `Theme.radius` keys. */
export const nextRadius = {
  xs: nextRadiusScale.xs,
  sm: nextRadiusScale.sm,
  md: nextRadiusScale.md,
  lg: nextRadiusScale.lg,
  full: nextRadiusScale.full,
} as const;

/**
 * Font families for the named type styles. Figma's are placeholders (Google
 * Sans Flex, DM Mono). Sans stays unset so Android keeps numeric weights.
 */
export const nextFontFamilies = { sans: undefined, mono: 'monospace' } as const;

/** Figma named type styles for Next (`Theme.type`). */
export const nextTypeStyles = buildTypeStyles(
  nextFontFamilies.sans,
  nextFontFamilies.mono,
);

/**
 * Partial `Theme.typography` overrides, read from the named styles.
 * `sm`/`lg`/`xl` ← label/title/overline.
 * Do **not** map Figma `reading` (42) onto `sizes.display` — that key is the
 * record capture timer in Legacy. New text should use `Theme.type` instead.
 * `md` (16) and `xs` (12) have no Foundations style — left to Legacy via merge.
 */
export const nextTypography = {
  fontFamily: 'System',
  sizes: {
    sm: nextTypeStyles.label.fontSize,
    lg: nextTypeStyles.title.fontSize,
    xl: nextTypeStyles.overline.fontSize,
  },
  weights: {
    medium: nextTypeStyles.overline.fontWeight,
    semibold: nextTypeStyles.title.fontWeight,
  },
  lineHeights: {
    tight: nextTypeStyles.label.lineHeight,
    normal: nextTypeStyles.title.lineHeight,
  },
} as const;
