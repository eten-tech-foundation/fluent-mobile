import { legacyTheme, type Theme } from './legacy';
import { nextThemes } from './next';
import {
  DEFAULT_COLOR_MODE,
  type ColorMode,
  type UiVersion,
} from './uiVersionTypes';

/**
 * Central theme resolution for the active UI version and color mode.
 * Legacy has no modes, so `mode` only applies to Next.
 */
export function resolveTheme(
  version: UiVersion,
  mode: ColorMode = DEFAULT_COLOR_MODE,
): Theme {
  return version === 'next' ? nextThemes[mode] : legacyTheme;
}
