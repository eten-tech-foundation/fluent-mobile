import { useCallback, useEffect, useState } from 'react';
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme/useTheme';

/**
 * Press progress for tactile controls (0 at rest, 1 when down): press-in over
 * `motion.pressMs`, release over `motion.releaseMs`, both on `easeStandard`.
 * Snaps when reduce motion is on. `active` holds it down (a latched key).
 */
export function usePressProgress(active = false) {
  const { motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const down = pressed || active;
  const progress = useSharedValue(down ? 1 : 0);

  const animateTo = useCallback(
    (toDown: boolean) => {
      const { x1, y1, x2, y2 } = motion.easeStandard;
      progress.value = withTiming(toDown ? 1 : 0, {
        duration: reduceMotion ? 0 : toDown ? motion.pressMs : motion.releaseMs,
        easing: Easing.bezier(x1, y1, x2, y2),
      });
    },
    [motion, progress, reduceMotion],
  );

  // Settle on pressed || active once both updates land. Android can deliver
  // onPressOut after onPress on quick taps, so release isn't animated there.
  useEffect(() => {
    animateTo(down);
  }, [down, animateTo]);

  const onPressIn = useCallback(() => {
    // Start the sink immediately rather than a render later.
    animateTo(true);
    setPressed(true);
  }, [animateTo]);
  const onPressOut = useCallback(() => setPressed(false), []);

  return { progress, down, onPressIn, onPressOut };
}
