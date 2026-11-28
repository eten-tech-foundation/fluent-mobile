import { createContext, useContext, useMemo } from 'react';
import {
  StyleSheet,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { DEFAULT_COLOR_MODE, type ColorMode } from './colorMode';
import type { Theme } from './nextBaseline';
import { resolveTheme } from './next';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

const ColorModeContext = createContext<ColorMode>(DEFAULT_COLOR_MODE);

/**
 * Renders a subtree in one Foundations color mode (Canvas, Hardware, Accent).
 * `useTheme()` below it returns that mode's roles, elevation and mapped colors.
 * Hardware is the default.
 */
export const ColorModeScope = ColorModeContext.Provider;

/** Color mode for this subtree (Hardware unless a `ColorModeScope` sets it). */
export function useColorMode(): ColorMode {
  return useContext(ColorModeContext);
}

/** Theme for the active color mode. Re-renders when a scope changes mode. */
export function useTheme(): Theme {
  return resolveTheme(useColorMode());
}

/**
 * Build StyleSheet styles from the active theme.
 * Use this instead of module-level `StyleSheet.create({ ...theme })` when
 * styles must follow a `ColorModeScope` change.
 *
 * Memoizes on `activeTheme` only. Do **not** close over props or other
 * changing state in `factory` — those values stay stale until the color mode
 * changes. Pass theme-derived values only; read props outside and merge.
 */
export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (activeTheme: Theme) => T,
): T {
  const activeTheme = useTheme();
  return useMemo(
    () => StyleSheet.create(factory(activeTheme)) as T,
    // factory must be theme-only; see JSDoc above.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme identity drives recompute
    [activeTheme],
  );
}
