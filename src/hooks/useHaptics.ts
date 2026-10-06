import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { isMicActive } from '../audio/micActivity';
import { useUiVersion } from '../theme/useTheme';
import { logger } from '../utils/logger';

const log = logger.create('haptics');

function perform(type: Haptics.AndroidHaptics): void {
  // The motor is audible in recordings, so stay silent while the mic is open.
  if (isMicActive()) {
    return;
  }
  Haptics.performAndroidHapticsAsync(type).catch((error: unknown) => {
    log.warn('Haptic feedback failed', { error });
  });
}

const noop = () => undefined;

/**
 * Semantic haptics for Next UI components; no-ops in Legacy. Add a method
 * when a component needs one, using the mapping in
 * docs/guides/figma-to-component.md. Uses the system haptics engine, so the
 * user's touch-feedback setting applies.
 */
export function useHaptics() {
  const isNext = useUiVersion() === 'next';
  return useMemo(
    () => ({
      press: isNext ? () => perform(Haptics.AndroidHaptics.Virtual_Key) : noop,
      toggle: isNext
        ? (on: boolean) =>
            perform(
              on
                ? Haptics.AndroidHaptics.Toggle_On
                : Haptics.AndroidHaptics.Toggle_Off,
            )
        : noop,
    }),
    [isNext],
  );
}
