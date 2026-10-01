import { legacyTheme, type Theme } from './legacy';
import { nextSpacing, nextRadius, nextTypography } from './nextFoundation';
import {
  NEXT_DEFAULT_COLOR_MODE,
  nextColorRoles,
  type NextColorRoleMode,
  type NextColorRoles,
} from './nextRoles';

/**
 * Widen `as const` string/number leaves so Next can supply different token
 * values. Object keys and nested structure stay aligned with `Theme`.
 */
type WidenTokens<T> = T extends string
  ? string
  : T extends number
  ? number
  : T extends boolean
  ? boolean
  : T extends null
  ? null
  : T extends readonly (infer U)[]
  ? readonly WidenTokens<U>[]
  : T extends object
  ? { -readonly [K in keyof T]: WidenTokens<T[K]> }
  : T;

/** Shared theme shape — same keys as Theme, configurable leaves widened. */
type ThemeShape = WidenTokens<Theme>;

type ThemeOverrides = {
  [K in keyof ThemeShape]?: DeepPartial<ThemeShape[K]>;
};

/** Nested partial so overrides can touch a single leaf under typography/sizes etc. */
type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge a partial onto a base group. Nested plain objects merge; arrays
 * and primitives replace. Lets Next set `typography.sizes.lg` without
 * restating every sibling key.
 */
function deepMergeGroup<T extends object>(base: T, partial: DeepPartial<T>): T {
  const result: Record<string, unknown> = { ...(base as object) };
  for (const [key, value] of Object.entries(partial as object)) {
    if (value === undefined) continue;
    const baseValue = (base as Record<string, unknown>)[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      result[key] = deepMergeGroup(baseValue, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Rebuild layout groups that are derived from colors / spacing / radius so a
 * Next color or spacing override does not leave stale Legacy-derived values.
 * Explicit layout overrides in `overrides` are applied on top afterward.
 */
function deriveLayoutTokens(theme: Theme): Theme {
  return {
    ...theme,
    homeListContent: {
      padding: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    listCard: {
      ...theme.listCard,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      gap: theme.spacing.md,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.cardBackground,
      borderColor: theme.colors.border,
    },
    headerLayout: {
      ...theme.headerLayout,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
    },
  };
}

/**
 * Apply deep overrides onto the Legacy theme, then re-derive layout tokens
 * from the resolved colors/spacing/radius. Groups not listed stay shared with
 * Legacy. Always returns a new object so `nextTheme !== legacyTheme`.
 */
function applyThemeOverrides(base: Theme, overrides: ThemeOverrides): Theme {
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides) as (keyof ThemeShape)[]) {
    const partial = overrides[key];
    if (!partial) continue;
    merged[key as string] = deepMergeGroup(
      base[key as keyof Theme] as object,
      partial as object,
    );
  }
  const withDerived = deriveLayoutTokens(merged as Theme);

  // Re-apply explicit layout overrides so callers can still pin individual leaves.
  const layoutKeys = ['homeListContent', 'listCard', 'headerLayout'] as const;
  let result = withDerived;
  for (const key of layoutKeys) {
    const partial = overrides[key];
    if (!partial) continue;
    result = {
      ...result,
      [key]: deepMergeGroup(result[key] as object, partial as object),
    };
  }
  return result;
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
      sizes: { ...nextTypography.sizes },
      weights: { ...nextTypography.weights },
      lineHeights: { ...nextTypography.lineHeights },
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
