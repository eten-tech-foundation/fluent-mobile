import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Circle, CircleCheck, Pause, Play, Trash2 } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { PlaybackProgressBar } from './PlaybackProgressBar';
import { RecordCircleButton } from './RecordCircleButton';

type DraftTakeRowProps = {
  takeNumber: number;
  /** Live engine position (ms) — only meaningful while this take is loaded/playing. */
  positionMs: number;
  /** Engine duration while loaded, or DB fallback from capture (ms). */
  durationMs: number;
  isPlaying: boolean;
  isSelected: boolean;
  onPlayPause: () => void;
  onSelect: () => void;
  onDelete: () => void;
  /** Review scrub — tap/drag waveform (#176). */
  onSeek?: (positionMs: number) => void;
  leadingIndicator?: 'selection' | 'canonicalReadOnly' | 'none';
  isCanonical?: boolean;
};

/** Design timer: `0:13` (no leading zero on minutes). */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Compact take-card row for the Review take list (#71).
 * Selection indicator (li:circle / li:circle-check) marks the active draft
 * (`is_selected`); selected card gets a highlighted border. Time + progress are
 * only live for whichever take is currently loaded into the playback engine
 * (see `playingTakeId` in `useVerseAudio`) — otherwise this shows the take's
 * stored duration at 0:00.
 */
export function DraftTakeRow({
  takeNumber,
  positionMs,
  durationMs,
  isPlaying,
  isSelected,
  onPlayPause,
  onSelect,
  onDelete,
  onSeek,
  leadingIndicator = 'selection',
  isCanonical = false,
}: DraftTakeRowProps) {
  const timeLabel =
    durationMs > 0
      ? `${formatDuration(positionMs)} / ${formatDuration(durationMs)}`
      : formatDuration(positionMs);

  return (
    <View
      style={[
        styles.row,
        leadingIndicator === 'selection' && isSelected && styles.rowSelected,
      ]}
      testID="record-take-row"
    >
      {leadingIndicator === 'selection' ? (
        <TouchableOpacity
          onPress={onSelect}
          accessibilityRole="button"
          accessibilityLabel={
            isSelected ? 'Selected take' : 'Select this take as active draft'
          }
          accessibilityState={{ selected: isSelected }}
          hitSlop={8}
          testID="record-take-select"
        >
          {isSelected ? (
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
      ) : leadingIndicator === 'canonicalReadOnly' && isCanonical ? (
        <View
          accessibilityLabel="Canonical take"
          testID="record-take-canonical-readonly"
        >
          <CircleCheck
            size={iconSizes.chevron}
            color={theme.colors.primary}
            strokeWidth={listIconStrokeWidth}
          />
        </View>
      ) : (
        <View style={styles.leadingSpacer} testID="record-take-no-indicator" />
      )}
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
        numberOfLines={1}
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowSelected: {
    borderColor: theme.colors.primary,
  },
  leadingSpacer: {
    width: iconSizes.chevron,
  },
  takeLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
    minWidth: 52,
  },
  waveform: {
    flex: 1,
    // The row is tight (select + label + play + timer + delete): the waveform
    // takes the leftovers and must stay inside them, never over the timer.
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
  deleteHit: {
    padding: theme.spacing.xs,
  },
});
