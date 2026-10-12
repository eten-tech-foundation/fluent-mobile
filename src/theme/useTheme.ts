import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import {
  StyleSheet,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  getUserPreferenceValue,
  subscribeToUserPreferences,
  type UiVersion,
} from '../services/userPreferences';
import type { Theme } from './legacy';
import { resolveTheme } from './uiVersion';
import { DEFAULT_COLOR_MODE, type ColorMode } from './uiVersionTypes';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

const UiVersionOverrideContext = createContext<UiVersion | null>(null);

/**
 * Pins a subtree to one UI version regardless of the device preference.
 * Only the component gallery uses this (it always reviews Next).
 */
export const UiVersionOverride = UiVersionOverrideContext.Provider;

/**
 * Active UI version from device preferences (or a `UiVersionOverride`).
 * Safe outside navigators (no useFocusEffect) — usable from root layouts.
 */
export function useUiVersion(): UiVersion {
  const stored = useSyncExternalStore(
    subscribeToUserPreferences,
    () => getUserPreferenceValue('uiVersion'),
    () => getUserPreferenceValue('uiVersion'),
  );
  return useContext(UiVersionOverrideContext) ?? stored;
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
