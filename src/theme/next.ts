import { legacyTheme, type Theme } from './legacy';

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
  [K in keyof ThemeShape]?: Partial<ThemeShape[K]>;
};

/**
 * Apply one-level-deep overrides onto the Legacy theme.
 * Groups not listed here stay shared with Legacy (no blind full-copy).
 * Always returns a new object so `nextTheme !== legacyTheme` (runtime switch identity).
 */
function applyThemeOverrides(base: Theme, overrides: ThemeOverrides): Theme {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides) as (keyof ThemeShape)[]) {
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
 * Next-only token overrides. Redesign tickets add values here — do not edit
 * `tokens.ts` / `layout.ts` / `iconSpecs.ts` for Next visuals.
 *
 * Empty today so the foundation toggle is a no-op until redesign work lands.
 */
const nextOverrides: ThemeOverrides = {
  // Example (future): colors: { primary: '#…' },
};

/** Resolved Next theme — Legacy baseline + explicit overrides. */
export const nextTheme: Theme = applyThemeOverrides(legacyTheme, nextOverrides);
