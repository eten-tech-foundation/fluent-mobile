import React from 'react';
import { StyleSheet, View } from 'react-native';
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
  accentColor = theme.colors.primary,
  tall = false,
}: Props) {
  const progress =
    durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const activeBars = Math.round(progress * barCount);
  const rowHeight = tall ? 72 : 28;

  return (
    <View
      style={[styles.row, { height: rowHeight }]}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: durationMs,
        now: positionMs,
      }}
    >
      {Array.from({ length: barCount }, (_, i) => {
        const height = tall
          ? 14 + ((Math.abs(Math.sin((positionMs + i * 40) / 90)) * 48) | 0)
          : 6 + ((i * 7) % 14);
        const active = tall || i < activeBars;
        return (
          <View
            key={i}
            style={[
              tall ? styles.barTall : styles.bar,
              { height, backgroundColor: accentColor },
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
    gap: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 1,
    maxWidth: 4,
  },
  barTall: {
    width: 5,
    borderRadius: 2.5,
    maxWidth: 5,
  },
  barActive: {
    opacity: 1,
  },
  barIdle: {
    opacity: 0.35,
  },
});
