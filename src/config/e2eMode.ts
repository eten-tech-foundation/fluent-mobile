/** `'1'` / `'true'` (trimmed, case-insensitive) — shared parse for E2E env flags. */
export function isEnvFlagOn(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

/**
 * Local Debug + Metro only: suppress Expo Dev Menu so Maestro taps are not stolen.
 * Never enable on production / preview / nightly EAS profiles. Not an auth bypass.
 */
export function isE2eModeEnabled(): boolean {
  if (!__DEV__) {
    return false;
  }
  return isEnvFlagOn(process.env.EXPO_PUBLIC_E2E_MODE);
}
