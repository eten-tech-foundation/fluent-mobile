import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import type { RecorderStatus } from '../../../../../hooks/useRecorder';
import { theme } from '../../../../../theme';

const LIVE_WAVEFORM_BARS = 22;

function liveBarHeight(height: number): ViewStyle {
  return { height };
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
}

export function RecordingWaveform({
  status,
  elapsedMs,
}: RecordingWaveformProps) {
  if (status === 'recording' || status === 'paused') {
    const active = status === 'recording';
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

  if (status === 'review') {
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
    opacity: 0.85,
  },
});
