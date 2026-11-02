import { createContext, useContext, useMemo } from 'react';
import {
  StyleSheet,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { Theme } from './legacy';
import { resolveTheme } from './uiVersion';
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_UI_VERSION,
  type ColorMode,
  type UiVersion,
} from './uiVersionTypes';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

const UiVersionOverrideContext = createContext<UiVersion | null>(null);

/**
 * Pins a subtree to one UI version regardless of the device preference.
 * The root preference bridge provides the stored version; gallery/test scopes
 * can override it locally without reading native preferences.
 */
export const UiVersionOverride = UiVersionOverrideContext.Provider;

/**
 * Active UI version from the root preference provider or a subtree override.
 * Presentation-only imports never initialize native preference storage. Outside
 * a provider, standalone chrome uses the safe Legacy default.
 */
export function useUiVersion(): UiVersion {
  return useContext(UiVersionOverrideContext) ?? DEFAULT_UI_VERSION;
}

const ColorModeContext = createContext<ColorMode>(DEFAULT_COLOR_MODE);

/**
 * Renders a subtree in one Foundations color mode (Canvas, Hardware, Accent).
 * `useTheme()` below it returns that mode's roles, elevation and mapped colors
 * in Next. Hardware is the default; Legacy ignores modes.
 */
export const ColorModeScope = ColorModeContext.Provider;

/** Color mode for this subtree (Hardware unless a `ColorModeScope` sets it). */
export function useColorMode(): ColorMode {
  return useContext(ColorModeContext);
}

/**
 * Theme for the active UI version and color mode — re-renders when the
 * preference changes.
 */
export function useTheme(): Theme {
  return resolveTheme(useUiVersion(), useColorMode());
}

/**
 * Build StyleSheet styles from the active theme.
 * Use this instead of module-level `StyleSheet.create({ ...theme })` when
 * styles must follow Legacy ↔ Next switches at runtime.
 *
 * Memoizes on `activeTheme` only. Do **not** close over props or other
 * changing state in `factory` — those values stay stale until the UI version
 * changes. Pass theme-derived values only; read props outside and merge.
 */
export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (activeTheme: Theme) => T,
): T {
  const activeTheme = useTheme();
  return useMemo(
    () => StyleSheet.create(factory(activeTheme)) as T,
    // factory must be theme-only; see guide + JSDoc above.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme identity drives recompute
    [activeTheme],
  );
}
