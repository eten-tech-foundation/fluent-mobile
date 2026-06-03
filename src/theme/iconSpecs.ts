import { spacing } from './tokens';

/** Progress ring stroke (`stroke-width="2.5"` in mock). */
export const progressRingStrokeWidth = 2.5;

/** Header, tabs, chevrons, and list sync icons (`stroke-width="2"` in mock). */
export const listIconStrokeWidth = 2;

/** Touch target expansion for header icon buttons. */
export const touchHitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Icon sizes aligned with fluent-test1.lovable.app. */
export const iconSizes = {
  header: 24,
  headerTab: 18,
  projectSync: 24,
  chapterSync: 16,
  chapterProgress: 22,
  chevron: 20,
} as const;

/** White wordmark dimensions (mock: h-10, aspect from SVG viewBox). */
export const logoSize = {
  height: 40,
  width: 118,
  marginVertical: -8,
} as const;

/** Page header layout (mock: px-4 py-3, w-10 side slots). */
export const headerLayout = {
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  sideSlot: 40,
  minHeight: 56,
} as const;
