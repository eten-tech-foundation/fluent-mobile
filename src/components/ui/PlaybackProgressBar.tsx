import React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../../theme';

type Props = {
  positionMs: number;
  durationMs: number;
  /** Decorative amplitude placeholders (not metering data). */
  barCount?: number;
};

/**
 * Waveform decision (#96): **static placeholder bars** keyed to playback
 * position — no Simform, no extra native deps. Live metering can replace
 * the decorative heights later without changing the player engine.
 */
export function PlaybackProgressBar({
  positionMs,
  durationMs,
  barCount = 24,
}: Props) {
  const progress =
    durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const activeBars = Math.round(progress * barCount);

  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: durationMs,
        now: positionMs,
      }}
    >
      {Array.from({ length: barCount }, (_, i) => {
        const height = 6 + ((i * 7) % 14);
        const active = i < activeBars;
        return (
          <View
            key={i}
            style={[
              styles.bar,
              { height },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
    gap: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 1,
    maxWidth: 4,
  },
  barActive: {
    backgroundColor: theme.colors.primary,
  },
  barIdle: {
    backgroundColor: theme.colors.mutedForeground,
    opacity: 0.35,
  },
});
