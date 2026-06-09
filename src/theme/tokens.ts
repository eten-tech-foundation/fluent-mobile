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

/** Lovable mock `--card` / `bg-card` (hsl 218 35% 94% → #eaeef5). */
const cardSurface = hslToHex(218, 35, 94);

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
  destructive: '#DC2626',
  workflowBadgeDraftBorder: '#FBBF24',
  workflowBadgeDraftText: '#1A1A1A',
  workflowBadgePeerCheckBorder: '#EA580C',
  workflowBadgePeerCheckText: '#1A1A1A',
  workflowBadgeNotStartedBorder: '#1A1A1A',
  workflowBadgeNotStartedText: '#1A1A1A',
} as const;

export const workflowBadges = {
  draft: {
    border: colors.workflowBadgeDraftBorder,
    text: colors.workflowBadgeDraftText,
  },
  peer_check: {
    border: colors.workflowBadgePeerCheckBorder,
    text: colors.workflowBadgePeerCheckText,
  },
  not_started: {
    border: colors.workflowBadgeNotStartedBorder,
    text: colors.workflowBadgeNotStartedText,
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
