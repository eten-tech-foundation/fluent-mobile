import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/** Minimum bars kept when the row is too narrow for the requested count. */
const MIN_FITTED_BARS = 6;

/**
 * Ignore Yoga sub-pixel / content-vs-constraint width jitter. Alternating
 * onLayout widths (±1–2px) used to re-enter setState → layout → setState and
 * throw "Maximum update depth exceeded" on physical Android (#298).
 */
export const LAYOUT_WIDTH_STABILITY_PX = 2;

/** Minimum spacing between scrub seeks while dragging. */
const SEEK_SAMPLE_MS = 80;

/**
 * Bars are fixed-width capsules separated by `barGap`, so a requested count can
 * exceed the row and paint over its neighbours (take rows put the timer right
 * of the waveform). Drop bars until the row fits its measured width.
 *
 * Before the first layout (`width <= 0`), return 0 — do **not** render the
 * full requested count. Painting 24×`minWidth` bars first inflates intrinsic
 * width, then the flex parent constrains it; that measure oscillation is what
 * drove the #298 update-depth loop on device.
 */
export function fittedBarCount(
  requestedCount: number,
  width: number,
  barWidth: number,
  gap: number,
): number {
  if (width <= 0) {
    return 0;
  }
  const fits = Math.floor((width + gap) / (barWidth + gap));
  return Math.max(
    Math.min(MIN_FITTED_BARS, requestedCount),
    Math.min(requestedCount, fits),
  );
}

/**
 * Stabilize measured track width against ±1–2px layout jitter.
 * Returns `prev` when the change is not meaningful.
 */
export function stableTrackWidth(prev: number, next: number): number {
  if (prev === next) {
    return prev;
  }
  if (prev > 0 && Math.abs(prev - next) <= LAYOUT_WIDTH_STABILITY_PX) {
    return prev;
  }
  return next;
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
  /** Same measurement, read by the gesture without waiting for a re-render. */
  const trackWidthRef = useRef(0);
  const [dragMs, setDragMs] = useState<number | null>(null);
  const displayMs = dragMs ?? positionMs;
  const progress =
    durationMs > 0 ? Math.min(1, Math.max(0, displayMs / durationMs)) : 0;
  const renderedBarCount = fittedBarCount(
    barCount,
    trackWidth,
    theme.waveform.barMinWidth,
    theme.waveform.barGap,
  );
  const activeBars = Math.round(progress * renderedBarCount);
  const rowHeight = tall
    ? theme.waveform.tallHeight
    : theme.waveform.dockHeight;

  // One Animated.Value per bar — kept across elapsedMs re-renders so the
  // capture loop is not restarted by the duration timer.
  const scales = useMemo(
    () =>
      Array.from({ length: renderedBarCount }, () => new Animated.Value(0.3)),
    [renderedBarCount],
  );

  useEffect(() => {
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
  }, [animate, scales]);

  const lastSeekAtRef = useRef(0);
  const pendingSeekMsRef = useRef<number | null>(null);

  const applySeek = (event: GestureResponderEvent, immediate: boolean) => {
    if (!seekable || !onSeek) {
      return;
    }
    const next = scrubPositionMs(
      event.nativeEvent.locationX,
      trackWidthRef.current,
      durationMs,
    );
    setDragMs(next);
    pendingSeekMsRef.current = next;
    // A drag emits a move per touch frame; each seek is a native player call,
    // so only sample them. The release below always seeks to the final spot.
    const now = Date.now();
    if (!immediate && now - lastSeekAtRef.current < SEEK_SAMPLE_MS) {
      return;
    }
    lastSeekAtRef.current = now;
    pendingSeekMsRef.current = null;
    onSeek(next);
  };

  const endSeek = () => {
    const pending = pendingSeekMsRef.current;
    pendingSeekMsRef.current = null;
    if (pending !== null && seekable && onSeek) {
      lastSeekAtRef.current = Date.now();
      onSeek(pending);
    }
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
        const next = Math.round(e.nativeEvent.layout.width);
        // Keep the scrub ref aligned with the hysteretic state — raw Yoga
        // jitter must not drive seeks to a width we rejected for render (#298).
        setTrackWidth(prev => {
          const accepted = stableTrackWidth(prev, next);
          trackWidthRef.current = accepted;
          return accepted;
        });
      }}
      onStartShouldSetResponder={() => seekable}
      onMoveShouldSetResponder={() => seekable}
      onResponderGrant={e => applySeek(e, true)}
      onResponderMove={e => applySeek(e, false)}
      onResponderRelease={endSeek}
      onResponderTerminate={endSeek}
    >
      {Array.from({ length: renderedBarCount }, (_, i) => {
        // Stable decorative heights per bar; progress fill is the active/inactive
        // split (left → right), not amplitude keyed to playback position.
        const amplitude = barAmplitude(i, i * 120, tall);
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
                  transform: [{ scaleY: scales[i]! }],
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
    justifyContent: 'flex-start',
    // Bars are measured-fit below, but clip until the first layout arrives so
    // they can never paint over a sibling (e.g. the take-row timer).
    overflow: 'hidden',
  },
  /**
   * Fixed width (not flex) so changing `fittedBarCount` does not alter the
   * row's intrinsic min-width and re-trigger onLayout with a different width.
   */
  bar: {
    width: theme.waveform.barMinWidth,
    borderRadius: theme.radius.full,
  },
  barActive: {
    opacity: 1,
  },
  barIdle: {
    opacity: 0.35,
  },
});
