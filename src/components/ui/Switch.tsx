import React, { useEffect } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';
import { useTheme, useThemedStyles } from '../../theme/useTheme';

/** Figma Switch: 88 × 36 track with a 44 × 30 knob. */
const TRACK_WIDTH = 88;
const TRACK_HEIGHT = 36;
const KNOB_WIDTH = 44;
const KNOB_HEIGHT = 30;
/** Pads the 36pt track out to the 48dp minimum touch target. */
const HIT_SLOP = (48 - TRACK_HEIGHT) / 2;

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Hardware switch from Foundations · 07 Tactile (Figma Switch, node 2326:41).
 * Inset track (sunken off, record red on) with a raised knob that slides.
 */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  style,
  testID,
}: SwitchProps) {
  const theme = useTheme();
  const haptics = useHaptics();
  const styles = useThemedStyles(t => ({
    track: {
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      borderRadius: t.radius.full,
      paddingHorizontal: t.spacing.xs,
      flexDirection: 'row',
      alignItems: 'center',
      boxShadow: t.elevation.inset,
    },
    knob: {
      width: KNOB_WIDTH,
      height: KNOB_HEIGHT,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.surfaceHighlight,
      boxShadow: t.elevation.raised,
    },
    disabled: {
      opacity: t.opacity.disabled,
    },
  }));

  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);
  const { motion, roles, spacing } = theme;
  const travel = TRACK_WIDTH - spacing.xs * 2 - KNOB_WIDTH;
  const offColor = roles.surfaceSunken;
  const onColor = roles.accentRecord;

  useEffect(() => {
    const { x1, y1, x2, y2 } = motion.easeStandard;
    progress.value = withTiming(value ? 1 : 0, {
      duration: reduceMotion ? 0 : motion.releaseMs,
      easing: Easing.bezier(x1, y1, x2, y2),
    });
  }, [value, motion, progress, reduceMotion]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [offColor, onColor],
    ),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: travel * progress.value }],
  }));

  return (
    <Pressable
      onPress={() => {
        haptics.toggle(!value);
        onValueChange(!value);
      }}
      disabled={disabled}
      hitSlop={{ top: HIT_SLOP, bottom: HIT_SLOP }}
      android_disableSound
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      style={[style, disabled && styles.disabled]}
      testID={testID}
    >
      <Animated.View
        style={[styles.track, trackStyle]}
        testID={testID ? `${testID}-track` : undefined}
      >
        <Animated.View
          style={[styles.knob, knobStyle]}
          testID={testID ? `${testID}-knob` : undefined}
        />
      </Animated.View>
    </Pressable>
  );
}
