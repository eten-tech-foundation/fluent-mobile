import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { RecorderStatus } from '../../../../../hooks/useRecorder';
import { theme } from '../../../../../theme';

const LIVE_WAVEFORM_BARS = 22;

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
              style={[
                styles.waveformBarLive,
                {
                  height: active ? height : 14,
                  opacity: active ? 1 : 0.5,
                },
              ]}
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
              {
                height: 10 + ((Math.abs(Math.cos(index / 2)) * 28) | 0),
                opacity: 0.85,
              },
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
  waveformBarStatic: {
    width: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.primary,
  },
});
