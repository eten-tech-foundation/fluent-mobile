import { legacyTheme, type Theme } from './legacy';
import { nextSpacing, nextRadius, nextTypography } from './nextFoundation';
import {
  NEXT_DEFAULT_COLOR_MODE,
  nextColorRoles,
  type NextColorRoleMode,
  type NextColorRoles,
} from './nextRoles';

/**
 * Loose override shape — Next values intentionally differ from Legacy literals.
 * Applied with a cast when building `nextTheme`.
 */
type ThemeOverrides = {
  colors?: Partial<Record<keyof Theme['colors'], string>>;
  spacing?: Partial<Record<keyof Theme['spacing'], number>>;
  radius?: Partial<Record<keyof Theme['radius'], number>>;
  typography?: {
    fontFamily?: string;
    sizes?: Partial<Record<keyof Theme['typography']['sizes'], number>>;
    weights?: Partial<Record<keyof Theme['typography']['weights'], string>>;
    lineHeights?: Partial<
      Record<keyof Theme['typography']['lineHeights'], number>
    >;
  };
  homeListContent?: Partial<Record<keyof Theme['homeListContent'], number>>;
  listCard?: Partial<Record<keyof Theme['listCard'], string | number>>;
};

/**
 * Apply one-level-deep overrides onto the Legacy theme.
 * Groups not listed here stay shared with Legacy (no blind full-copy).
 * Always returns a new object so `nextTheme !== legacyTheme` (runtime switch identity).
 */
function applyThemeOverrides(base: Theme, overrides: ThemeOverrides): Theme {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides) as (keyof ThemeOverrides)[]) {
    const partial = overrides[key];
    if (!partial) continue;
    result[key as string] = {
      ...(base[key as keyof Theme] as object),
      ...(partial as object),
    };
  }
  return result as Theme;
}

/**
 * Map a Foundations color-role mode onto existing `Theme.colors` keys.
 * Sync/warning workflow colors stay on Legacy until redesign defines them.
 */
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

function buildNextOverrides(mode: NextColorRoleMode): ThemeOverrides {
  const roles = nextColorRoles[mode];
  const colors = mapRolesToThemeColors(roles);

  return {
    colors,
    spacing: { ...nextSpacing },
    radius: { ...nextRadius },
    typography: {
      fontFamily: nextTypography.fontFamily,
      sizes: {
        ...legacyTheme.typography.sizes,
        ...nextTypography.sizes,
      },
      weights: {
        ...legacyTheme.typography.weights,
        ...nextTypography.weights,
      },
      lineHeights: {
        ...legacyTheme.typography.lineHeights,
        ...nextTypography.lineHeights,
      },
    },
    homeListContent: {
      padding: nextSpacing.lg,
      gap: nextSpacing.sm,
    },
    listCard: {
      ...legacyTheme.listCard,
      paddingHorizontal: nextSpacing.lg,
      paddingVertical: nextSpacing.md,
      gap: nextSpacing.md,
      borderRadius: nextRadius.sm,
      backgroundColor:
        colors.cardBackground ?? legacyTheme.listCard.backgroundColor,
      borderColor: colors.border ?? legacyTheme.listCard.borderColor,
    },
  };
}

/**
 * Next theme overrides from Figma Foundations.
 * Default chrome mode is Hardware (light panels / screens).
 * Canvas / Accent remain available via `nextColorRoles` for drafting overlays.
 *
 * Source: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2308-6
 */
const nextOverrides: ThemeOverrides = buildNextOverrides(
  NEXT_DEFAULT_COLOR_MODE,
);

/** Resolved Next theme — Legacy baseline + Foundations (Hardware) overrides. */
export const nextTheme: Theme = applyThemeOverrides(legacyTheme, nextOverrides);

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
