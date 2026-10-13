import React, { useEffect } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme, useThemedStyles } from '../../theme/useTheme';

/** Figma Page dot: Active 14, Inactive 10. */
const ACTIVE_SIZE = 14;
const INACTIVE_SIZE = 10;

export interface PageDotsProps {
  count: number;
  /** Zero-based page that's showing. */
  index: number;
  /** e.g. "Page 2 of 7". */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function Dot({ active, testID }: { active: boolean; testID?: string }) {
  const { motion, roles, radius } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);
  const inactiveColor = roles.fgInactive;
  const activeColor = roles.fgPrimary;

  useEffect(() => {
    const { x1, y1, x2, y2 } = motion.easeStandard;
    progress.value = withTiming(active ? 1 : 0, {
      duration: reduceMotion ? 0 : motion.releaseMs,
      easing: Easing.bezier(x1, y1, x2, y2),
    });
  }, [active, motion, progress, reduceMotion]);

  const dotStyle = useAnimatedStyle(() => {
    const size = interpolate(
      progress.value,
      [0, 1],
      [INACTIVE_SIZE, ACTIVE_SIZE],
    );
    return {
      width: size,
      height: size,
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [inactiveColor, activeColor],
      ),
    };
  });

  return (
    <Animated.View
      style={[{ borderRadius: radius.full }, dotStyle]}
      testID={testID}
    />
  );
}

/**
 * Reading page position in the player (Figma Page dot, node 2409:508): the
 * current page grows and darkens to fg/primary.
 */
export function PageDots({
  count,
  index,
  accessibilityLabel,
  style,
  testID,
}: PageDotsProps) {
  const styles = useThemedStyles(t => ({
    row: {
      height: ACTIVE_SIZE,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
    },
  }));

  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {Array.from({ length: count }, (_, i) => (
        <Dot
          key={i}
          active={i === index}
          testID={testID ? `${testID}-dot-${i}` : undefined}
        />
      ))}
    </View>
  );
}
