/**
 * Runtime UI surface version. Not light/dark — selects Legacy vs Next presentation.
 * Preference storage lives in `userPreferences` (device-level).
 *
 * Types-only module: keep free of theme object imports so preference reads
 * do not pull the full theme assembly into the module graph.
 */
export type UiVersion = 'legacy' | 'next';

export const DEFAULT_UI_VERSION: UiVersion = 'legacy';

export function isUiVersion(value: string | undefined): value is UiVersion {
  return value === 'legacy' || value === 'next';
}
