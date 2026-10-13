import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme, useThemedStyles } from '../../theme/useTheme';

/** Figma Progress ring: 56pt, 3pt ring, wrapping a 48pt Round button. */
const RING_SIZE = 56;
const RING_WIDTH = 3;
const RADIUS = (RING_SIZE - RING_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /** 0–1. 0 shows nothing (Figma None); 1 is a full arc (Complete). */
  value: number;
  /** Centered inside the ring, usually a `RoundButton`. */
  children?: React.ReactNode;
  /** What's in progress; TalkBack reads it with the percent. */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Passage progress around the row button (Figma Progress ring, node 2400:302).
 * fg/inactive track with an accent/primary arc running clockwise from 12.
 */
export function ProgressRing({
  value,
  children,
  accessibilityLabel,
  style,
  testID,
}: ProgressRingProps) {
  const theme = useTheme();
  const styles = useThemedStyles(() => ({
    ring: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Sibling of the child so TalkBack can focus the ring and the button
    // separately; an accessible wrapper would swallow the button.
    progress: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: RING_SIZE,
      height: RING_SIZE,
    },
  }));

  const clamped = Math.min(1, Math.max(0, value));
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(clamped);
  const { motion } = theme;

  // Linear, not ease-standard: playback reports position every 100ms, and an
  // ease-out would stall at each update instead of sweeping continuously.
  useEffect(() => {
    progress.value = withTiming(clamped, {
      duration: reduceMotion ? 0 : motion.releaseMs,
      easing: Easing.linear,
    });
  }, [clamped, motion, progress, reduceMotion]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  return (
    <View style={[styles.ring, style]} testID={testID}>
      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(clamped * 100),
        }}
      >
        {clamped > 0 ? (
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            testID={testID ? `${testID}-arc` : undefined}
          >
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={theme.roles.fgInactive}
              strokeWidth={RING_WIDTH}
              fill="none"
            />
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={theme.roles.accentPrimary}
              strokeWidth={RING_WIDTH}
              fill="none"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              animatedProps={arcProps}
              rotation={-90}
              origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
          </Svg>
        ) : null}
      </View>
      {children}
    </View>
  );
}
