import { spacing } from './tokens';

/** Progress ring stroke (`stroke-width="2.5"` in mock). */
export const progressRingStrokeWidth = 2.5;

/** Header, tabs, chevrons, and list sync icons (`stroke-width="2"` in mock). */
export const listIconStrokeWidth = 2;

/** @deprecated Use listIconStrokeWidth — kept for compatibility with #32 naming. */
export const lucideStrokeWidth = listIconStrokeWidth;

/** Touch target expansion for header icon buttons. */
export const touchHitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Icon sizes for headers, list rows, and status indicators. */
export const iconSizes = {
  header: 24,
  headerTab: 18,
  projectSync: 24,
  chapterSync: 16,
  chapterProgress: 22,
  chevron: 20,
  /** Phase status circle on project chapter rows (`h-12 w-12` in mock). */
  phaseIcon: 48,
  phaseIconGlyph: 24,
  /** Glyph inside idle Record CTA (Lovable / design `h-24` control). */
  recordIdleGlyph: 44,
  /** Glyph inside capture/review primary control (`h-20`). */
  recordPrimaryGlyph: 30,
} as const;

/** Phase icon stroke (`strokeWidth="1.75"` in mock). */
export const phaseIconStrokeWidth = 1.75;

/** White wordmark dimensions (mock: h-10, aspect from SVG viewBox). */
export const logoSize = {
  height: 40,
  width: 118,
  marginVertical: -8,
} as const;

/** Nav-bar sync glyph composition and motion. */
export const syncStatusIcon = {
  /** Centered `refresh-cw` size relative to header icon. */
  overlayScale: 0.46,
  /** Nudge accent glyphs into the cloud body (fraction of icon size). */
  overlayOffsetY: -0.06,
  accentStrokeWidth: 2.5,
  spinDurationMs: 1200,
  pendingPulseDurationMs: 900,
} as const;

/** Page header layout (mock: px-4 py-3, w-10 side slots). */
export const headerLayout = {
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  sideSlot: 40,
  minHeight: 56,
} as const;
