import { colors } from './tokens';
import type { NextColorRoles } from './nextRoles';

/**
 * Nearest Legacy equivalents for the Foundations role names, so components
 * built against `theme.roles` render sensibly when Legacy is active.
 */
export const legacyRoles: NextColorRoles = {
  bgDefault: colors.background,
  bgClear: 'rgba(255, 255, 255, 0)',
  surfaceHighlight: colors.background,
  surfaceDefault: colors.cardBackground,
  surfaceInverse: colors.foreground,
  surfaceInverseMuted: colors.mutedForeground,
  surfaceSunken: colors.border,
  fgPrimary: colors.foreground,
  fgSecondary: colors.mutedForeground,
  fgInactive: colors.border,
  fgOnInverse: colors.background,
  fgOnAccent: colors.primaryForeground,
  borderHighlight: colors.background,
  borderShadow: colors.border,
  borderRim: colors.border,
  shadowCast: 'rgba(0, 0, 0, 0.32)',
  shadowFloat: 'rgba(0, 0, 0, 0.24)',
  shadowEdge: 'rgba(0, 0, 0, 0.12)',
  shadowDish: 'rgba(0, 0, 0, 0.08)',
  accentPrimary: colors.primary,
  accentRecord: colors.recordAccent,
};
