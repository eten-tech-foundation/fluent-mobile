import { legacyTheme, type Theme } from './legacy';

type ThemeOverrides = {
  [K in keyof Theme]?: Partial<Theme[K]>;
};

/**
 * Apply one-level-deep overrides onto the Legacy theme.
 * Groups not listed here stay shared with Legacy (no blind full-copy).
 * Always returns a new object so `nextTheme !== legacyTheme` (runtime switch identity).
 */
function applyThemeOverrides(base: Theme, overrides: ThemeOverrides): Theme {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides) as (keyof Theme)[]) {
    const partial = overrides[key];
    if (!partial) continue;
    result[key as string] = {
      ...(base[key] as object),
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
