import type { Theme } from './legacy';
import { nextBaseline } from './nextBaseline';
import {
  NEXT_DEFAULT_COLOR_MODE,
  type NextColorRoleMode,
  type NextColorRoles,
} from './nextRoles';

/**
 * Next starts with the current design while retaining its own token ownership.
 * All tokens are JSON data; copy each mode deeply so neither Legacy, the
 * baseline, nor another mode shares a mutable nested group with this theme.
 */
function createNextTheme(): Theme {
  return JSON.parse(JSON.stringify(nextBaseline)) as Theme;
}

/** Future Figma role mapping; deliberately not applied during current parity. */
export function mapRolesToThemeColors(
  roles: NextColorRoles,
): Partial<Record<keyof Theme['colors'], string>> {
  return {
    background: roles.bgDefault,
    foreground: roles.fgPrimary,
    primary: roles.accentPrimary,
    primaryForeground: roles.fgOnAccent,
    cardBackground: roles.surfaceDefault,
    tabBarBackground: roles.surfaceDefault,
    mutedForeground: roles.fgSecondary,
    border: roles.borderRim,
    recordAccent: roles.accentRecord,
    destructive: roles.accentRecord,
    drawerOverlay: roles.shadowCast,
    waveformActive: roles.accentPrimary,
    waveformIdle: roles.fgInactive,
  };
}

/**
 * Keep the mode API so future Next surfaces can diverge without forking shared
 * components. Today's modes deliberately match the current mobile design.
 */
export const nextThemes: Record<NextColorRoleMode, Theme> = {
  canvas: createNextTheme(),
  hardware: createNextTheme(),
  accent: createNextTheme(),
};

export const nextTheme: Theme = nextThemes[NEXT_DEFAULT_COLOR_MODE];

export { nextPrimitives } from './nextPrimitives';
export {
  nextColorRoles,
  NEXT_DEFAULT_COLOR_MODE,
  type NextColorRoleMode,
  type NextColorRoles,
} from './nextRoles';
export {
  nextSpace,
  nextSpacing,
  nextRadius,
  nextRadiusScale,
  nextTypeStyles,
  nextTypography,
} from './nextFoundation';
