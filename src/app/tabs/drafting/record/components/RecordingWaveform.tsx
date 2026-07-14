import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { RecorderStatus } from '../../../../../types/recording/types';
import { theme } from '../../../../../theme';

export const LIVE_WAVEFORM_BARS = 40;

const BAR_WIDTH = 3;

// Live bar height range (px) for a normalized `0..1` level. A silent sample
// renders at `BAR_WIDTH` so it reads as a round dot rather than a flat line.
export const MIN_BAR_HEIGHT = BAR_WIDTH;
export const MAX_BAR_HEIGHT = 62;

function liveBarHeight(height: number): ViewStyle {
  return { height };
}

/** Maps a normalized `0..1` level to a bar height in pixels. */
function levelToHeight(level: number): number {
  const clamped = Math.min(1, Math.max(0, level));
  return MIN_BAR_HEIGHT + clamped * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
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
  /** Normalized (`0..1`) input levels, newest last; rendered right-aligned. */
  levels?: number[];
}

export function RecordingWaveform({
  status,
  levels = [],
}: RecordingWaveformProps) {
  if (status === RecorderStatus.Recording || status === RecorderStatus.Paused) {
    const active = status === RecorderStatus.Recording;
    // Right-align: bar `i` reads sample `offset + i`; negative indices are silent.
    const offset = levels.length - LIVE_WAVEFORM_BARS;
    return (
      <View
        style={styles.waveform}
        testID="record-waveform-live"
        accessibilityLabel="Recording waveform"
      >
        {Array.from({ length: LIVE_WAVEFORM_BARS }).map((_, index) => {
          const sampleIndex = offset + index;
          const level = sampleIndex >= 0 ? levels[sampleIndex] ?? 0 : 0;
          return (
            <View
              key={index}
              style={[
                styles.waveformBarLive,
                active
                  ? styles.waveformBarLiveActive
                  : styles.waveformBarLivePaused,
                liveBarHeight(levelToHeight(level)),
              ]}
            />
          );
        })}
      </View>
    );
  }

  if (status === RecorderStatus.Review) {
    return (
      <View
        style={styles.waveform}
        testID="record-waveform-static"
        accessibilityLabel="Draft waveform"
      >
        {Array.from({ length: LIVE_WAVEFORM_BARS }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.waveformBarStatic,
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
    width: '70%',
    alignSelf: 'center',
  },
  waveformBarLive: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: theme.colors.recordAccent,
  },
  waveformBarLiveActive: {
    opacity: 1,
  },
  waveformBarLivePaused: {
    opacity: 0.5,
  },
  waveformBarStatic: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: theme.colors.primary,
    opacity: 0.85,
  },
});
