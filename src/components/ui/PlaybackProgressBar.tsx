import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';
import { theme } from '../../theme';

type Props = {
  positionMs: number;
  durationMs: number;
  /** Decorative amplitude placeholders (not metering data). */
  barCount?: number;
  /** Bar fill color — recording uses recordAccent; paused/review use primary. */
  accentColor?: string;
  /** Taller bars for Record-tab capture/review waveforms. */
  tall?: boolean;
  /**
   * Live capture pulse (Lovable `animate-waveform` / `scaleY`). Uses the native
   * driver so motion stays smooth; heights are decorative, not mic metering.
   */
  animate?: boolean;
  /**
   * Review scrub (#176). When set, tap/drag maps x → ms and calls this.
   * Ignored while `animate` (live capture) is on.
   */
  onSeek?: (positionMs: number) => void;
};

/** Lovable-style decorative height: sine envelope + light phase noise (0–1). */
function barAmplitude(index: number, seedMs: number, tall: boolean): number {
  const t = index * 0.8 + seedMs / 900;
  const wave = 0.42 + Math.sin(t) * 0.28 + Math.sin(t * 1.7 + index) * 0.18;
  const floor = tall ? 0.22 : 0.28;
  return Math.min(1, Math.max(floor, wave));
}

/** Map touch x within the waveform width to a clamped playback position. */
export function scrubPositionMs(
  locationX: number,
  width: number,
  durationMs: number,
): number {
  if (width <= 0 || durationMs <= 0) {
    return 0;
  }
  const ratio = Math.min(1, Math.max(0, locationX / width));
  return Math.round(ratio * durationMs);
}

/**
 * Waveform decision (#96): **static placeholder bars** keyed to playback
 * position — decorative amplitudes (not mic metering). Optional `animate`
 * mode for capture-state pulse (Lovable scaleY loop). Live metering can
 * replace decorative heights later. Progress fill is real when `durationMs` /
 * `positionMs` come from the playback engine; source-audio dock passes stub
 * values on purpose.
 *
 * Optional `onSeek` enables Review scrubbing (#176 / #49 deferred AC).
 */
export function PlaybackProgressBar({
  positionMs,
  durationMs,
  barCount = 24,
  accentColor = theme.colors.primary,
  tall = false,
  animate = false,
  onSeek,
}: Props) {
  const seekable = Boolean(onSeek) && !animate && durationMs > 0;
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragMs, setDragMs] = useState<number | null>(null);
  const displayMs = dragMs ?? positionMs;
  const progress =
    durationMs > 0 ? Math.min(1, Math.max(0, displayMs / durationMs)) : 0;
  const activeBars = Math.round(progress * barCount);
  const rowHeight = tall
    ? theme.waveform.tallHeight
    : theme.waveform.dockHeight;

  // One Animated.Value per bar — kept across elapsedMs re-renders so the
  // capture loop is not restarted by the duration timer.
  const scalesRef = useRef<Animated.Value[]>([]);
  if (scalesRef.current.length !== barCount) {
    scalesRef.current = Array.from(
      { length: barCount },
      () => new Animated.Value(0.3),
    );
  }

  useEffect(() => {
    const scales = scalesRef.current;
    if (!animate) {
      scales.forEach(scale => {
        scale.stopAnimation();
        scale.setValue(1);
      });
      return;
    }

    // Lovable: @keyframes waveform-animate { 0.3 → 1 → 0.6 → 0.9 → 0.3 }
    // over 0.8s ease-in-out, infinite, with per-bar stagger.
    const loops = scales.map((scale, i) => {
      scale.setValue(0.3);
      const step = 200;
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1,
            duration: step,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.6,
            duration: step,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.9,
            duration: step,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.3,
            duration: step,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      const starter = Animated.sequence([Animated.delay((i % 8) * 55), anim]);
      starter.start();
      return { starter, anim };
    });

    return () => {
      loops.forEach(({ starter, anim }) => {
        starter.stop();
        anim.stop();
      });
    };
  }, [animate, barCount]);

  const applySeek = (event: GestureResponderEvent) => {
    if (!seekable || !onSeek) {
      return;
    }
    const next = scrubPositionMs(
      event.nativeEvent.locationX,
      trackWidth,
      durationMs,
    );
    setDragMs(next);
    onSeek(next);
  };

  const endSeek = () => {
    setDragMs(null);
  };

  return (
    <View
      style={[styles.row, { height: rowHeight, gap: theme.waveform.barGap }]}
      accessibilityRole={seekable ? 'adjustable' : 'progressbar'}
      accessibilityLabel={seekable ? 'Draft waveform scrubber' : undefined}
      accessibilityValue={{
        min: 0,
        max: durationMs,
        now: displayMs,
      }}
      testID={animate ? 'playback-progress-animated' : 'playback-progress'}
      onLayout={(e: LayoutChangeEvent) => {
        setTrackWidth(e.nativeEvent.layout.width);
      }}
      onStartShouldSetResponder={() => seekable}
      onMoveShouldSetResponder={() => seekable}
      onResponderGrant={applySeek}
      onResponderMove={applySeek}
      onResponderRelease={endSeek}
      onResponderTerminate={endSeek}
    >
      {Array.from({ length: barCount }, (_, i) => {
        // Capture pulse uses a stable seed so timer ticks don't jump heights.
        const amplitude = barAmplitude(i, animate ? i * 120 : displayMs, tall);
        const baseHeight = Math.round(
          Math.max(
            theme.waveform.barMinHeight,
            amplitude * (rowHeight - theme.spacing.xs),
          ),
        );
        const active = tall || i < activeBars;

        if (animate && tall) {
          return (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  height: baseHeight,
                  backgroundColor: accentColor,
                  opacity: 1,
                  transform: [{ scaleY: scalesRef.current[i]! }],
                },
              ]}
            />
          );
        }

        return (
          <View
            key={i}
            style={[
              styles.bar,
              { height: baseHeight, backgroundColor: accentColor },
              active ? styles.barActive : styles.barIdle,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** Lovable: `flex-1 rounded-full` capsule bars. */
  bar: {
    flex: 1,
    minWidth: theme.waveform.barMinWidth,
    borderRadius: theme.radius.full,
  },
  barActive: {
    opacity: 1,
  },
  barIdle: {
    opacity: 0.35,
  },
});
