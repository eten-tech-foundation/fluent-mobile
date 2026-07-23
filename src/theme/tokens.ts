/** Converts HSL (degrees, percent, percent) to hex for React Native StyleSheet. */
export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Card surface (`--card` / `bg-card`, hsl 218 35% 94% → #eaeef5). */
const cardSurface = hslToHex(218, 35, 94);

/** Stage accent + 15% tint (`bg-badge-*-bg` in mock). */
function stageColors(h: number, s: number, l: number) {
  const hex = hslToHex(h, s, l);
  return {
    phaseColor: hex,
    phaseTint: `${hex}26`,
    badgeBorder: hex,
  } as const;
}

export const colors = {
  primary: '#0B50D0',
  primaryForeground: '#FFFFFF',
  background: '#FFFFFF',
  foreground: '#1A1A1A',
  cardBackground: cardSurface,
  tabBarBackground: cardSurface,
  mutedForeground: hslToHex(0, 0, 33),
  border: hslToHex(220, 18, 80),
  syncSynced: '#16A34A',
  syncUnsynced: '#EAB308',
  syncDownloading: '#0B50D0',
  /** Nav-bar cloud sync status (issue #38). */
  syncStatusSynced: '#17B26A',
  syncStatusPending: '#E48F06',
  syncStatusOffline: '#A0A0A0',
  destructive: '#DC2626',
  /** Record button + live-recording waveform (drafting Record tab). */
  recordAccent: '#DC2626',
  /** Progress / paused waveform fill (Lovable `--waveform-active`). */
  waveformActive: hslToHex(219, 87, 59),
  workflowBadgeDraftBorder: '#FBBF24',
  workflowBadgeDraftText: '#1A1A1A',
  workflowBadgePeerCheckBorder: '#EA580C',
  workflowBadgePeerCheckText: '#1A1A1A',
  workflowBadgeNotStartedBorder: '#6B7280',
  workflowBadgeNotStartedText: '#FFFFFF',
} as const;

/** Workflow stage tokens (light mode). */
export const workflowStages = {
  not_started: {
    label: 'Not Started',
    phaseColor: null,
    phaseTint: null,
    phaseIcon: null,
    badgeBorder: hslToHex(220, 9, 46),
  },
  draft: {
    label: 'Draft',
    phaseIcon: 'mic',
    ...stageColors(43, 96, 56),
  },
  peer_check: {
    label: 'Peer Check',
    phaseIcon: 'user-check',
    ...stageColors(20, 89, 48),
  },
  community_check: {
    label: 'Community Check',
    phaseIcon: 'users-round',
    ...stageColors(271, 81, 56),
  },
  advanced_check: {
    label: 'Advanced Check',
    phaseIcon: 'badge-check',
    ...stageColors(203, 87, 53),
  },
  complete: {
    label: 'Complete',
    phaseIcon: 'circle-check',
    ...stageColors(142, 76, 36),
  },
} as const;

export type WorkflowStageId = keyof typeof workflowStages;

/** @deprecated Use workflowStages — kept for My Work compatibility. */
export const workflowBadges = {
  draft: {
    border: workflowStages.draft.badgeBorder,
    text: colors.foreground,
  },
  peer_check: {
    border: workflowStages.peer_check.badgeBorder,
    text: colors.foreground,
  },
  not_started: {
    border: workflowStages.not_started.badgeBorder,
    text: colors.foreground,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

export const typography = {
  fontFamily: 'System',
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    /** Record capture timer (`text-4xl` / 2.25rem in Lovable). */
    display: 32,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeights: {
    tight: 20,
    normal: 24,
  },
} as const;

/** Record-tab control diameters (Lovable `h-24` / `h-20` / `h-14`). */
export const recordControlSizes = {
  idle: 96,
  primary: 80,
  stop: 56,
  secondary: 48,
} as const;

/**
 * Decorative waveform chrome (Lovable `flex-1 rounded-full` / `w-1.5 rounded-full`).
 * Capsule bars that flex across the row — not stubby max-width rectangles.
 */
export const waveform = {
  /** Gap between bars (`gap-0.5` ≈ 2px, slightly roomier for RN). */
  barGap: 3,
  barMinWidth: 3,
  barMinHeight: 4,
  dockHeight: 28,
  tallHeight: 72,
} as const;

/** Soft elevation for white stop control + red record CTA. */
export const shadows = {
  soft: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
} as const;
