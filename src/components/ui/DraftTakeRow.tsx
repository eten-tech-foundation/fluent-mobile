import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Pause, Play, Trash2 } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { PlaybackProgressBar } from './PlaybackProgressBar';
import { RecordCircleButton } from './RecordCircleButton';

type DraftTakeRowProps = {
  takeNumber: number;
  /** Live engine position (ms). */
  positionMs: number;
  /** Engine duration, or DB fallback from capture (ms). */
  durationMs: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onDelete: () => void;
  /** Review scrub — tap/drag waveform (#176). */
  onSeek?: (positionMs: number) => void;
};

/** Design timer: `0:13` (no leading zero on minutes). */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Latest-take row for Record has-draft (Lovable: select / play / waveform / delete).
 * Time + progress are wired to real take playback (`useVerseAudio` → engine).
 * Multi-take list selection stays deferred until more than one take is shown.
 */
export function DraftTakeRow({
  takeNumber,
  positionMs,
  durationMs,
  isPlaying,
  onPlayPause,
  onDelete,
  onSeek,
}: DraftTakeRowProps) {
  const timeLabel =
    durationMs > 0
      ? `${formatDuration(positionMs)} / ${formatDuration(durationMs)}`
      : formatDuration(positionMs);

  return (
    <View style={styles.row} testID="record-take-row">
      <View style={styles.selectedDot} accessibilityLabel="Selected take" />
      <Text style={styles.takeLabel} testID="record-take-badge">
        Take {takeNumber}
      </Text>
      <RecordCircleButton
        variant="play"
        size={theme.recordControlSizes.secondary}
        onPress={onPlayPause}
        accessibilityLabel={isPlaying ? 'Pause draft' : 'Play draft'}
        testID="record-play-button"
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
          onSeek={onSeek}
        />
      </View>
      <Text
        style={styles.time}
        testID="record-take-time"
        accessibilityLabel={`Take time ${timeLabel}`}
      >
        {timeLabel}
      </Text>
      <TouchableOpacity
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel="Delete take"
        testID="record-delete-button"
        hitSlop={8}
        style={styles.deleteHit}
      >
        <Trash2
          size={iconSizes.chevron}
          color={theme.colors.destructive}
          strokeWidth={listIconStrokeWidth}
        />
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
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  takeLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
    minWidth: 52,
  },
  waveform: {
    flex: 1,
    minHeight: 28,
  },
  time: {
    fontSize: theme.typography.sizes.xs,
    fontVariant: ['tabular-nums'],
    color: theme.colors.mutedForeground,
    minWidth: 64,
    textAlign: 'right',
  },
  deleteHit: {
    padding: theme.spacing.xs,
  },
});
