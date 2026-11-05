import React, { useCallback, useEffect, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme, useThemedStyles } from '../../theme/useTheme';

export interface ScreenHeaderProps {
  /** True once the content under the header has scrolled off its top. */
  scrolled: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A Next screen's header row: room under its buttons, and a rim stroke that
 * fades in along the bottom once the content scrolls under it.
 */
export function ScreenHeader({
  scrolled,
  children,
  style,
  testID,
}: ScreenHeaderProps) {
  const { motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(scrolled ? 1 : 0);
  const styles = useThemedStyles(t => ({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.md,
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.md,
    },
    stroke: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: t.stroke[1],
      backgroundColor: t.roles.borderRim,
    },
  }));

  useEffect(() => {
    const { x1, y1, x2, y2 } = motion.easeStandard;
    shown.value = withTiming(scrolled ? 1 : 0, {
      duration: reduceMotion ? 0 : motion.releaseMs,
      easing: Easing.bezier(x1, y1, x2, y2),
    });
  }, [scrolled, motion, reduceMotion, shown]);
  const strokeStyle = useAnimatedStyle(() => ({ opacity: shown.value }));

  return (
    <View style={[styles.header, style]} testID={testID}>
      {children}
      <Animated.View
        style={[styles.stroke, strokeStyle]}
        pointerEvents="none"
        testID={testID ? `${testID}-stroke` : undefined}
      />
    </View>
  );
}

/** Whether a vertical scroll has left its top, for `ScreenHeader`. */
export function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) =>
      setScrolled(e.nativeEvent.contentOffset.y > 0),
    [],
  );
  return { scrolled, onScroll };
}
