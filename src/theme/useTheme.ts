import { useMemo, useSyncExternalStore } from 'react';
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

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * Active UI version from device preferences.
 * Safe outside navigators (no useFocusEffect) — usable from root layouts.
 */
export function useUiVersion(): UiVersion {
  return useSyncExternalStore(
    subscribeToUserPreferences,
    () => getUserPreferenceValue('uiVersion'),
    () => getUserPreferenceValue('uiVersion'),
  );
}

/** Theme for the active UI version — re-renders when the preference changes. */
export function useTheme(): Theme {
  return resolveTheme(useUiVersion());
}

/**
 * Build StyleSheet styles from the active theme.
 * Use this instead of module-level `StyleSheet.create({ ...theme })` when
 * styles must follow Legacy ↔ Next switches at runtime.
 */
export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (activeTheme: Theme) => T,
): T {
  const activeTheme = useTheme();
  return useMemo(
    () => StyleSheet.create(factory(activeTheme)) as T,
    // factory is expected to close over stable theme-driven values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme identity drives recompute
    [activeTheme],
  );
}
