import { useEffect } from 'react';
import { isE2eModeEnabled } from '../config/e2eMode';

/**
 * When EXPO_PUBLIC_E2E_MODE is set in __DEV__, hide the Expo Dev Menu sheet.
 * No-op outside E2E mode / production.
 */
export function E2eDevMenuGuard() {
  useEffect(() => {
    if (!isE2eModeEnabled()) {
      return;
    }
    void import('expo-dev-client')
      .then(devClient => {
        devClient.hideMenu?.();
      })
      .catch(() => {
        // Dev client unavailable — Maestro helper flow still dismisses residual UI.
      });
  }, []);

  return null;
}
