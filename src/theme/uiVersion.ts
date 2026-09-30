import { legacyTheme, type Theme } from './legacy';
import { nextTheme } from './next';
import type { UiVersion } from './uiVersionTypes';

export type { UiVersion } from './uiVersionTypes';
export { DEFAULT_UI_VERSION, isUiVersion } from './uiVersionTypes';

/** Central theme resolution for the active UI version. */
export function resolveTheme(version: UiVersion): Theme {
  return version === 'next' ? nextTheme : legacyTheme;
}
