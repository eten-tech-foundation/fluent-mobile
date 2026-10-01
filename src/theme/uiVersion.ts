import { legacyTheme, type Theme } from './legacy';
import { nextTheme } from './next';
import type { UiVersion } from './uiVersionTypes';

/** Central theme resolution for the active UI version. */
export function resolveTheme(version: UiVersion): Theme {
  return version === 'next' ? nextTheme : legacyTheme;
}
