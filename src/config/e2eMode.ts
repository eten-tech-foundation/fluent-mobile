/**
 * Local Debug + Metro only: suppress Expo Dev Menu so Maestro taps are not stolen.
 * Never enable on production / preview / nightly EAS profiles. Not an auth bypass.
 */
export function isE2eModeEnabled(): boolean {
  if (!__DEV__) {
    return false;
  }
  const value = process.env.EXPO_PUBLIC_E2E_MODE?.trim().toLowerCase();
  return value === '1' || value === 'true';
}
