import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { RecorderStatus } from '../../../../../types/recording/types';
import { theme } from '../../../../../theme';

const LIVE_WAVEFORM_BARS = 22;

// `positionMs` comes from the player's async status polling, so it lags a
// released seek by a frame or more. Treat the seek as "confirmed" once the
// reported position lands within this tolerance of the target, or after the
// timeout elapses — whichever comes first — so a slow/imprecise seek can't
// pin the display on the target forever.
const SEEK_CONFIRM_TOLERANCE_MS = 300;
const SEEK_CONFIRM_TIMEOUT_MS = 800;

function liveBarHeight(height: number): ViewStyle {
  return { height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const staticBarHeightStyles = StyleSheet.create(
  Object.fromEntries(
    Array.from({ length: LIVE_WAVEFORM_BARS }, (_, index) => [
      `h${index}`,
      {
        height: 10 + ((Math.abs(Math.cos(index / 2)) * 28) | 0),
      },
    ]),
  ) as Record<string, ViewStyle>,
);

interface RecordingWaveformProps {
  status: RecorderStatus;
  elapsedMs: number;
  /** Current playback position (ms) — drives the review progress fill. */
  positionMs?: number;
  /** Total take length (ms) — enables scrubbing when > 0. */
  durationMs?: number;
  /** Seek to an absolute position (ms) when the review waveform is scrubbed. */
  onSeek?: (ms: number) => void;
}

export function RecordingWaveform({
  status,
  elapsedMs,
  positionMs = 0,
  durationMs = 0,
  onSeek,
}: RecordingWaveformProps) {
  const [width, setWidth] = useState(0);
  // Ratio the finger is currently dragging to; null when not scrubbing so the
  // fill tracks live playback position instead.
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  // Target (ms) of a seek that was just released, held until `positionMs`
  // confirms it — otherwise the fill snaps back to the stale pre-seek
  // position for a frame while the async seek is still in flight, then jumps
  // forward again once it lands (the flicker).
  const [pendingSeekMs, setPendingSeekMs] = useState<number | null>(null);
  const pendingSeekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(
    () => () => {
      if (pendingSeekTimeoutRef.current) {
        clearTimeout(pendingSeekTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (pendingSeekMs === null) return;
    if (Math.abs(positionMs - pendingSeekMs) <= SEEK_CONFIRM_TOLERANCE_MS) {
      setPendingSeekMs(null);
    }
  }, [pendingSeekMs, positionMs]);

  if (status === RecorderStatus.Recording || status === RecorderStatus.Paused) {
    const active = status === RecorderStatus.Recording;
    return (
      <View
        style={styles.waveform}
        testID="record-waveform-live"
        accessibilityLabel="Recording waveform"
      >
        {Array.from({ length: LIVE_WAVEFORM_BARS }).map((_, index) => {
          const height =
            14 + ((Math.abs(Math.sin((elapsedMs + index * 40) / 90)) * 48) | 0);
          return (
            <View
              key={index}
              style={
                active
                  ? [
                      styles.waveformBarLive,
                      styles.waveformBarLiveActive,
                      liveBarHeight(height),
                    ]
                  : styles.waveformBarLivePaused
              }
            />
          );
        })}
      </View>
    );
  }

  if (status === RecorderStatus.Review) {
    const scrubbable = durationMs > 0 && !!onSeek;
    const effectivePositionMs = pendingSeekMs ?? positionMs;
    const displayRatio =
      scrubRatio ??
      (durationMs > 0 ? clamp(effectivePositionMs / durationMs, 0, 1) : 0);
    const filledBars = Math.round(displayRatio * LIVE_WAVEFORM_BARS);

    const ratioFromEvent = (event: GestureResponderEvent): number =>
      clamp(event.nativeEvent.locationX / width, 0, 1);

    const handleLayout = (event: LayoutChangeEvent) => {
      setWidth(event.nativeEvent.layout.width);
    };

    // Raw responder handlers (rather than PanResponder) - no gesture handlers
    const responderHandlers = scrubbable
      ? {
          onStartShouldSetResponder: () => true,
          onMoveShouldSetResponder: () => true,
          onResponderGrant: (event: GestureResponderEvent) => {
            if (width > 0) setScrubRatio(ratioFromEvent(event));
          },
          onResponderMove: (event: GestureResponderEvent) => {
            if (width > 0) setScrubRatio(ratioFromEvent(event));
          },
          onResponderRelease: (event: GestureResponderEvent) => {
            if (width > 0) {
              const target = ratioFromEvent(event) * durationMs;
              onSeek!(target);
              setPendingSeekMs(target);
              if (pendingSeekTimeoutRef.current) {
                clearTimeout(pendingSeekTimeoutRef.current);
              }
              pendingSeekTimeoutRef.current = setTimeout(() => {
                setPendingSeekMs(null);
              }, SEEK_CONFIRM_TIMEOUT_MS);
            }
            setScrubRatio(null);
          },
          onResponderTerminate: () => setScrubRatio(null),
        }
      : {};

    return (
      <View
        style={styles.waveform}
        testID="record-waveform-static"
        accessibilityLabel={
          scrubbable ? 'Draft waveform, scrub to seek' : 'Draft waveform'
        }
        accessibilityRole={scrubbable ? 'adjustable' : undefined}
        onLayout={handleLayout}
        pointerEvents="box-only"
        {...responderHandlers}
      >
        {Array.from({ length: LIVE_WAVEFORM_BARS }).map((_, index) => (
          <View
            key={index}
            style={[
              index < filledBars
                ? styles.waveformBarFilled
                : styles.waveformBarStatic,
              staticBarHeightStyles[`h${index}`],
            ]}
          />
        ))}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 72,
    width: '50%',
    alignSelf: 'center',
  },
  waveformBarLive: {
    width: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.recordAccent,
  },
  waveformBarLiveActive: {
    opacity: 1,
  },
  waveformBarLivePaused: {
    height: 14,
    width: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.recordAccent,
    opacity: 0.5,
  },
  waveformBarStatic: {
    width: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.primary,
    opacity: 0.3,
  },
  waveformBarFilled: {
    width: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.primary,
    opacity: 0.95,
  },
});
