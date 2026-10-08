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

/**
 * Map onto existing `Theme.spacing` keys.
 * Unmapped Figma steps: `space-2`, `space-32` (use `nextSpace` directly when needed).
 * `xl` (20) has no Foundations step — kept at 20 until design assigns one.
 */
export const nextSpacing = {
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

/**
 * Map onto existing `Theme.radius` keys.
 * Unmapped: `radius-xs` (4) — use `nextRadiusScale.xs` when needed.
 */
export const nextRadius = {
  sm: nextRadiusScale.sm,
  md: nextRadiusScale.md,
  lg: nextRadiusScale.lg,
  full: nextRadiusScale.full,
} as const;

/** Figma type styles (Inter placeholder; family TBD). */
export const nextTypeStyles = {
  reading: { size: 42, lineHeight: 52, weight: '400' as const },
  title: { size: 18, lineHeight: 24, weight: '600' as const },
  label: { size: 14, lineHeight: 20, weight: '600' as const },
  overline: { size: 20, lineHeight: 24, weight: '500' as const },
} as const;

/**
 * Partial `Theme.typography` overrides.
 * `sm`/`lg`/`xl` ← label/title/overline.
 * Do **not** map Figma `reading` (42) onto `sizes.display` — that key is the
 * record capture timer in Legacy. Keep `nextTypeStyles.reading` for a future
 * reading/Canvas surface key.
 * `md` (16) and `xs` (12) have no Foundations style — left to Legacy via merge.
 */
export const nextTypography = {
  fontFamily: 'System',
  sizes: {
    sm: nextTypeStyles.label.size,
    lg: nextTypeStyles.title.size,
    xl: nextTypeStyles.overline.size,
  },
  weights: {
    medium: nextTypeStyles.overline.weight,
    semibold: nextTypeStyles.title.weight,
  },
  lineHeights: {
    tight: nextTypeStyles.label.lineHeight,
    normal: nextTypeStyles.title.lineHeight,
  },
} as const;
