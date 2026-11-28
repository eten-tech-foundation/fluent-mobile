import { useMemo } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { isMicActive } from '../audio/micActivity';
import { logger } from '../utils/logger';

const log = logger.create('haptics');

function perform(type: Haptics.AndroidHaptics): void {
  // The motor is audible in recordings, so stay silent for the whole take,
  // including while it is paused.
  if (isMicActive()) {
    return;
  }
  Haptics.performAndroidHapticsAsync(type).catch((error: unknown) => {
    log.warn('Haptic feedback failed', { error });
  });
}

/** Drag_Start needs API 34 and Gesture_End API 30; older phones get the nearest one. */
const atLeast = (api: number) =>
  typeof Platform.Version === 'number' && Platform.Version >= api;

/**
 * Semantic haptics for touch feedback. Uses the system haptics engine, so
 * the user's touch-feedback setting applies. Add a method when a component
 * needs one, using the mapping in docs/guides/figma-to-component.md.
 */
export function useHaptics() {
  return useMemo(
    () => ({
      press: () => perform(Haptics.AndroidHaptics.Virtual_Key),
      toggle: (on: boolean) =>
        perform(
          on
            ? Haptics.AndroidHaptics.Toggle_On
            : Haptics.AndroidHaptics.Toggle_Off,
        ),
      dragStart: () =>
        perform(
          atLeast(34)
            ? Haptics.AndroidHaptics.Drag_Start
            : Haptics.AndroidHaptics.Long_Press,
        ),
      dragEnd: () =>
        perform(
          atLeast(30)
            ? Haptics.AndroidHaptics.Gesture_End
            : Haptics.AndroidHaptics.Virtual_Key,
        ),
    }),
    [],
  );
}
