import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
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
import { VerseChip, verseChipWidth } from './VerseChip';

/** Figma Wave bar: 2 wide, heights 6–52 in a 52pt row. */
const BAR_WIDTH = 2;
const ROW_HEIGHT = 52;
/** Verses this far outside the frame still mount, so the scroll never shows a gap. */
const WINDOW_MARGIN = 64;
/** Window size before the frame is measured. */
const UNMEASURED_WIDTH = 480;
/** Figma holds the playhead about a third of the way across (130 of 380). */
const PLAYHEAD_ANCHOR = 1 / 3;

export interface WaveformVerse {
  verse: number;
  /** Bar heights in pt, one per sample. */
  bars: readonly number[];
}

export interface WaveformProps {
  verses: readonly WaveformVerse[];
  /** 0–1 through the whole waveform. */
  progress: number;
  /** What's playing; TalkBack reads it with the percent. */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A seek (Next, Previous, scrubbing) jumps past the window margin. */
export function waveformSnaps(prevOffset: number, nextOffset: number) {
  return Math.abs(nextOffset - prevOffset) > WINDOW_MARGIN;
}

/**
 * How far to slide the strip left so the playhead stays at the anchor once it
 * gets there. 0 until the frame has been measured.
 */
export function waveformOffset(playheadX: number, frameWidth: number): number {
  if (frameWidth <= 0) {
    return 0;
  }
  return Math.max(0, playheadX - frameWidth * PLAYHEAD_ANCHOR);
}

/**
 * Player waveform (Figma Wave bar 2409:505 and Verse chip 2409:502): a verse
 * chip, then that verse's bars, played in fg/primary and unplayed in
 * fg/inactive. The strip scrolls so the played edge holds about a third across.
 */
export function Waveform({
  verses,
  progress,
  accessibilityLabel,
  style,
  testID,
}: WaveformProps) {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    frame: { height: ROW_HEIGHT, overflow: 'hidden' },
    // Absolute, so the strip's width never feeds back into the frame's layout
    // (the measure loop behind #298 / #596 in PlaybackProgressBar).
    strip: {
      position: 'absolute',
      top: 0,
      left: 0,
      height: ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: t.spacing.lg,
      gap: t.spacing.md,
    },
    bars: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
    bar: {
      width: BAR_WIDTH,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.fgInactive,
    },
    played: { backgroundColor: t.roles.fgPrimary },
  }));

  const { spacing, motion } = theme;
  const layout = useMemo(() => {
    const barX: number[] = [];
    const verseStart: number[] = [];
    const verseSpan: { from: number; to: number }[] = [];
    let x = spacing.lg;
    for (const v of verses) {
      verseStart.push(barX.length);
      const from = x;
      x += verseChipWidth(v.verse) + spacing.md;
      for (let i = 0; i < v.bars.length; i++) {
        barX.push(x);
        x += BAR_WIDTH + spacing.xs;
      }
      verseSpan.push({ from, to: x });
      if (v.bars.length > 0) {
        x += spacing.md - spacing.xs;
      }
    }
    return { barX, verseStart, verseSpan };
  }, [verses, spacing]);

  const total = layout.barX.length;
  const clamped = Math.min(1, Math.max(0, progress));
  // Rounded so a ratio like 20/77 lands on bar 20, not 19.999….
  const position = Math.round(clamped * total * 1e6) / 1e6;
  const playedCount = Math.floor(position);
  const lastBar = Math.min(playedCount, total - 1);
  // Interpolate toward the real next bar so crossing a chip doesn't jump.
  const fromX = layout.barX[lastBar] ?? 0;
  const toX = layout.barX[lastBar + 1] ?? fromX + BAR_WIDTH + spacing.xs;
  const playheadX =
    total > 0 ? fromX + (position - lastBar) * (toX - fromX) : 0;

  const [frameWidth, setFrameWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setFrameWidth(prev => (prev === next ? prev : next));
  };

  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const measured = useRef(false);
  const lastTarget = useRef(0);
  const target = waveformOffset(playheadX, frameWidth);

  // Linear like ProgressRing: position arrives every 100ms during playback.
  // The first measured offset snaps so the strip doesn't slide in on mount.
  useEffect(() => {
    if (!measured.current) {
      measured.current = frameWidth > 0;
      lastTarget.current = target;
      offset.value = target;
      return;
    }
    // A seek (Next, Previous, scrubbing) snaps instead of sliding, so the
    // bar window never shows blank spacers mid-slide.
    const jump = waveformSnaps(lastTarget.current, target);
    lastTarget.current = target;
    offset.value =
      jump || reduceMotion
        ? target
        : withTiming(target, {
            duration: motion.releaseMs,
            easing: Easing.linear,
          });
  }, [target, frameWidth, motion, offset, reduceMotion]);

  // Only mount bars near the frame; a long pericope would otherwise mount
  // every bar it has. Off-screen verses keep their width as a spacer.
  const viewWidth = frameWidth || UNMEASURED_WIDTH;
  const inWindow = (vi: number) =>
    layout.verseSpan[vi].to >= target - WINDOW_MARGIN &&
    layout.verseSpan[vi].from <= target + viewWidth + WINDOW_MARGIN;
  const barsWidth = (count: number) =>
    count * BAR_WIDTH + (count - 1) * spacing.xs;

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -offset.value }],
  }));

  return (
    <View
      style={[styles.frame, style]}
      onLayout={onLayout}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      testID={testID}
    >
      <Animated.View
        style={[styles.strip, stripStyle]}
        importantForAccessibility="no-hide-descendants"
        testID={testID ? `${testID}-strip` : undefined}
      >
        {verses.map((v, vi) => (
          <React.Fragment key={vi}>
            <VerseChip
              verse={v.verse}
              current={layout.verseStart[vi] <= lastBar}
              testID={testID ? `${testID}-verse-${v.verse}` : undefined}
            />
            {v.bars.length > 0 && !inWindow(vi) ? (
              <View style={{ width: barsWidth(v.bars.length) }} />
            ) : v.bars.length > 0 ? (
              <VerseBars
                bars={v.bars}
                start={layout.verseStart[vi]}
                played={Math.min(
                  v.bars.length,
                  Math.max(0, playedCount - layout.verseStart[vi]),
                )}
                styles={styles}
                testID={testID}
              />
            ) : null}
          </React.Fragment>
        ))}
      </Animated.View>
    </View>
  );
}

type BarStyles = {
  bars: StyleProp<ViewStyle>;
  bar: StyleProp<ViewStyle>;
  played: StyleProp<ViewStyle>;
};

/** One verse's bars; memoized so a tick only re-renders the verse playing. */
const VerseBars = memo(function VerseBars({
  bars,
  start,
  played,
  styles,
  testID,
}: {
  bars: readonly number[];
  start: number;
  played: number;
  styles: BarStyles;
  testID?: string;
}) {
  return (
    <View style={styles.bars}>
      {bars.map((height, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: Math.min(ROW_HEIGHT, Math.max(0, height)) },
            i < played && styles.played,
          ]}
          testID={testID ? `${testID}-bar-${start + i}` : undefined}
        />
      ))}
    </View>
  );
});
