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

/**
 * Foundations color-role mode (Figma Roles collection). Canvas is the dark
 * reading / recording surface, Hardware the light chrome, Accent the blue
 * note overlays. Only applies in Next; Legacy has no modes.
 */
export type ColorMode = 'canvas' | 'hardware' | 'accent';

export const DEFAULT_COLOR_MODE: ColorMode = 'hardware';
