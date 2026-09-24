import { useEffect } from 'react';
import { isE2eModeEnabled } from '../config/e2eMode';

/**
 * When EXPO_PUBLIC_E2E_MODE is set in __DEV__, keep the Expo Dev Menu closed.
 * Maestro taps can still open it; hide on an interval so flows are not stolen.
 * No-op outside E2E mode / production.
 */
export function E2eDevMenuGuard() {
  useEffect(() => {
    if (!isE2eModeEnabled()) {
      return;
    }

    let cancelled = false;
    let hideMenu: (() => void) | undefined;
    let closeMenu: (() => void) | undefined;

    void import('expo-dev-client')
      .then(devClient => {
        if (cancelled) {
          return;
        }
        hideMenu = devClient.hideMenu?.bind(devClient);
        closeMenu = devClient.closeMenu?.bind(devClient);
        hideMenu?.();
        closeMenu?.();
      })
      .catch(() => {
        // Dev client unavailable — Maestro helper flow still dismisses residual UI.
      });

    const intervalId = setInterval(() => {
      hideMenu?.();
      closeMenu?.();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return null;
}
