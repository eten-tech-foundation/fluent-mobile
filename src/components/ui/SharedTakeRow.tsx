import React from 'react';
import { RecordCircleButton } from './RecordCircleButton';
import { PlaybackProgressBar } from './PlaybackProgressBar';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { Circle, CircleCheck, Pause, Play } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type SharedTakeRowProps = {
  takeNumber: number;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  isCanonical: boolean;
  onPlayPause: () => void;
  onDesignateCanonical: () => void;
};

function formatDuration(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SharedTakeRow({
  takeNumber,
  positionMs,
  durationMs,
  isPlaying,
  isCanonical,
  onPlayPause,
  onDesignateCanonical,
}: SharedTakeRowProps) {
  const timeLabel =
    durationMs > 0
      ? `${formatDuration(positionMs)} / ${formatDuration(durationMs)}`
      : formatDuration(positionMs);

  return (
    <View style={styles.row} testID="shared-take-row">
      <Text style={styles.takeLabel} testID="shared-take-badge">
        Take {takeNumber}
      </Text>
      <RecordCircleButton
        variant="play"
        size={theme.recordControlSizes.secondary}
        onPress={onPlayPause}
        accessibilityLabel={isPlaying ? 'Pause take' : 'Play take'}
        testID="shared-take-play-button"
      >
        {isPlaying ? (
          <Pause
            size={iconSizes.headerTab}
            color={theme.colors.primaryForeground}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <Play
            size={iconSizes.headerTab}
            color={theme.colors.primaryForeground}
            strokeWidth={listIconStrokeWidth}
          />
        )}
      </RecordCircleButton>
      <View style={styles.waveform}>
        <PlaybackProgressBar
          positionMs={positionMs}
          durationMs={durationMs}
          barCount={24}
          accentColor={theme.colors.waveformActive}
        />
      </View>
      <Text
        style={styles.time}
        numberOfLines={1}
        testID="shared-take-time"
        accessibilityLabel={`Take time ${timeLabel}`}
      >
        {timeLabel}
      </Text>
      <TouchableOpacity
        onPress={onDesignateCanonical}
        accessibilityRole="button"
        accessibilityLabel={
          isCanonical ? 'Canonical take' : 'Designate this take as canonical'
        }
        accessibilityState={{ selected: isCanonical }}
        hitSlop={8}
        testID="shared-take-canonical"
      >
        {isCanonical ? (
          <CircleCheck
            size={iconSizes.chevron}
            color={theme.colors.primary}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <Circle
            size={iconSizes.chevron}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '100%',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cardBackground,
  },
  takeLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
    minWidth: 52,
  },
  waveform: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    minHeight: 28,
  },
  time: {
    fontSize: theme.typography.sizes.xs,
    fontVariant: ['tabular-nums'],
    color: theme.colors.mutedForeground,
    minWidth: 64,
    flexShrink: 0,
    textAlign: 'right',
  },
});
