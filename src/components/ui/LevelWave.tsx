import React, { memo, useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
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

/** Levels arrive at the recorder's 100ms metering rate; motion spans a sample. */
const SAMPLE_MS = 100;
/** Short: the Pericope header's 16 resting dots (Figma Progress dot, 4 × 4). */
const SHORT_SAMPLES = 16;
const SHORT_DOT = 4;
const SHORT_MAX = 16;
/** Long: the Recorder take card (Figma 2555:910), 80 tall, bars up to 66. */
const LONG_HEIGHT = 80;
const LONG_BAR = 2;
const LONG_MIN = 6;
const LONG_MAX = 66;
const REST_TICK_WIDTH = 1;
const REST_TICK_HEIGHT = 7;
/** The recording front holds about two thirds across (Figma 206 of 332). */
const PLAYHEAD_ANCHOR = 2 / 3;
/** Bars kept past the left edge so the scroll never uncovers a gap. */
const OFFSCREEN_BARS = 8;

export interface LevelWaveProps {
  /** `short` for status (header), `long` for the take being recorded. */
  variant: 'short' | 'long';
  /** Input levels 0–1, oldest first; 0 is silence (a resting dot). */
  levels: readonly number[];
  /** Long only: draw the playhead at the recording front. */
  recording?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/**
 * Resting waveform that lifts with voice input (Figma Progress dot 2409:509
 * and the Recorder take card). Presentational: callers pass levels, newest last.
 */
export function LevelWave(props: LevelWaveProps) {
  return props.variant === 'short' ? (
    <ShortWave {...props} />
  ) : (
    <LongWave {...props} />
  );
}

function ShortWave({
  levels,
  accessibilityLabel,
  style,
  testID,
}: LevelWaveProps) {
  const styles = useThemedStyles(t => ({
    row: {
      height: SHORT_MAX,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.xs,
    },
  }));
  const recent = levels.slice(-SHORT_SAMPLES);
  const padded = [
    ...Array<number>(SHORT_SAMPLES - recent.length).fill(0),
    ...recent,
  ];

  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {padded.map((level, i) => (
        <ShortDot
          key={i}
          height={Math.max(SHORT_DOT, clamp01(level) * SHORT_MAX)}
          testID={testID ? `${testID}-dot-${i}` : undefined}
        />
      ))}
    </View>
  );
}

function ShortDot({ height, testID }: { height: number; testID?: string }) {
  const { roles, radius } = useTheme();
  const reduceMotion = useReducedMotion();
  const h = useSharedValue(height);

  // Linear over one sample so levels morph instead of stepping.
  useEffect(() => {
    h.value = withTiming(height, {
      duration: reduceMotion ? 0 : SAMPLE_MS,
      easing: Easing.linear,
    });
  }, [height, h, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ height: h.value }));

  return (
    <Animated.View
      style={[
        {
          width: SHORT_DOT,
          height,
          borderRadius: radius.full,
          backgroundColor: roles.fgSecondary,
        },
        animated,
      ]}
      testID={testID}
    />
  );
}

/**
 * How far to slide the recorded bars left so the recording front stays at
 * the anchor once it gets there. 0 until the frame has been measured.
 */
export function levelWaveOffset(frontX: number, frameWidth: number): number {
  if (frameWidth <= 0) {
    return 0;
  }
  return Math.max(0, frontX - frameWidth * PLAYHEAD_ANCHOR);
}

function LongWave({
  levels,
  recording = false,
  accessibilityLabel,
  style,
  testID,
}: LevelWaveProps) {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    frame: { height: LONG_HEIGHT, overflow: 'hidden' },
    layer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: LONG_HEIGHT,
    },
    bar: {
      position: 'absolute',
      width: LONG_BAR,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.fgPrimary,
    },
    tick: {
      position: 'absolute',
      top: (LONG_HEIGHT - REST_TICK_HEIGHT) / 2,
      width: REST_TICK_WIDTH,
      height: REST_TICK_HEIGHT,
      backgroundColor: t.roles.fgInactive,
    },
    playhead: {
      position: 'absolute',
      top: 0,
      width: LONG_BAR,
      height: LONG_HEIGHT,
      backgroundColor: t.roles.fgPrimary,
    },
  }));

  const { spacing } = theme;
  const pitch = LONG_BAR + spacing.xxs;
  const frontX = levels.length * pitch;

  // Absolute layers, so nothing inside feeds back into the frame's layout
  // (the measure loop behind #298 / #596 in PlaybackProgressBar).
  const [frameWidth, setFrameWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setFrameWidth(prev => (prev === next ? prev : next));
  };

  const target = levelWaveOffset(frontX, frameWidth);
  const frontOnScreen = frontX - target;
  const reduceMotion = useReducedMotion();
  // One animated front drives both the scroll and the playhead, so they
  // can't drift apart mid-animation.
  const front = useSharedValue(0);
  const measured = useRef(false);
  const anchorX = frameWidth * PLAYHEAD_ANCHOR;

  useEffect(() => {
    if (!measured.current) {
      measured.current = frameWidth > 0;
      front.value = frontX;
      return;
    }
    front.value = withTiming(frontX, {
      duration: reduceMotion ? 0 : SAMPLE_MS,
      easing: Easing.linear,
    });
  }, [frontX, frameWidth, front, reduceMotion]);

  const barsStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: anchorX > 0 ? -Math.max(0, front.value - anchorX) : 0 },
    ],
  }));
  const playheadStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: anchorX > 0 ? Math.min(front.value, anchorX) : front.value,
      },
    ],
  }));

  const firstVisible = Math.max(0, Math.floor(target / pitch) - OFFSCREEN_BARS);
  const tickStart =
    levels.length > 0 ? Math.ceil((frontOnScreen + pitch) / pitch) : 0;
  const tickCount = Math.max(0, Math.floor(frameWidth / pitch) - tickStart + 1);

  return (
    <View
      style={[styles.frame, style]}
      onLayout={onLayout}
      accessible
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View
        style={styles.layer}
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: tickCount }, (_, i) => (
          <View
            key={tickStart + i}
            style={[styles.tick, { left: (tickStart + i) * pitch }]}
          />
        ))}
      </View>
      <Animated.View
        style={[styles.layer, barsStyle]}
        importantForAccessibility="no-hide-descendants"
      >
        <RecordedBars
          levels={levels}
          from={firstVisible}
          pitch={pitch}
          barStyle={styles.bar}
          testID={testID}
        />
      </Animated.View>
      {recording && levels.length > 0 ? (
        <Animated.View
          style={[styles.playhead, playheadStyle]}
          testID={testID ? `${testID}-playhead` : undefined}
        />
      ) : null}
    </View>
  );
}

/** Only the bars that can be on screen; a long take never renders them all. */
const RecordedBars = memo(function RecordedBars({
  levels,
  from,
  pitch,
  barStyle,
  testID,
}: {
  levels: readonly number[];
  from: number;
  pitch: number;
  barStyle: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <>
      {levels.slice(from).map((level, k) => {
        const i = from + k;
        const height = LONG_MIN + clamp01(level) * (LONG_MAX - LONG_MIN);
        return (
          <View
            key={i}
            style={[
              barStyle,
              { left: i * pitch, top: (LONG_HEIGHT - height) / 2, height },
            ]}
            testID={testID ? `${testID}-bar-${i}` : undefined}
          />
        );
      })}
    </>
  );
});
