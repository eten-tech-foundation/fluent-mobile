import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  CircleDot,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from 'lucide-react-native';
import { RecorderStatus } from '../../../../../types/recording/types';
import { theme } from '../../../../../theme';
import { listIconStrokeWidth } from '../../../../../theme/iconSpecs';
import { formatDuration } from '../utils/recordTabUtils';

/** Paused-state helper copy, keyed by whether the take is resumable/recovered. */
function pausedTip(canResume: boolean, isRecovered: boolean): string {
  if (!canResume) {
    return 'A paused take was recovered from a previous session. Discard it to start fresh.';
  }
  if (isRecovered) {
    return 'Recovered a paused take from a previous session. Resume to keep recording, or discard it.';
  }
  return 'Recording paused — review the source below, then resume.';
}

interface RecordingControlsProps {
  status: RecorderStatus;
  reference: string;
  elapsedMs: number;
  isPlaying: boolean;
  /** Whether the paused take can be resumed (always true once paused). */
  canResume?: boolean;
  /**
   * True when the paused take was rehydrated after a process kill. Adds a
   * Discard affordance alongside Resume/Stop and swaps in recovery copy.
   */
  isRecovered?: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDiscard?: () => void;
  onTogglePlayback: () => void;
  onReRecord: () => void;
  onDelete: () => void;
}

export function RecordingControls({
  status,
  reference,
  elapsedMs,
  isPlaying,
  canResume = true,
  isRecovered = false,
  onStart,
  onPause,
  onResume,
  onStop,
  onDiscard,
  onTogglePlayback,
  onReRecord,
  onDelete,
}: RecordingControlsProps) {
  return (
    <View style={styles.controls}>
      {status === RecorderStatus.Idle && (
        <View style={styles.idleGroup}>
          <TouchableOpacity
            style={styles.recordButtonCircle}
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel={`Record ${reference}`}
            testID="record-start-button"
          >
            <CircleDot
              size={44}
              color={theme.colors.primaryForeground}
              strokeWidth={listIconStrokeWidth}
            />
          </TouchableOpacity>
          <Text style={styles.recordButtonLabel} testID="record-start-label">
            Record {reference}
          </Text>
          <View
            style={styles.mutedPlaceholderCircle}
            accessibilityRole="button"
            accessibilityLabel="Playback unavailable until a draft is recorded"
            accessibilityState={{ disabled: true }}
            testID="record-play-idle-placeholder"
          >
            <Play
              size={22}
              color={theme.colors.mutedForeground}
              strokeWidth={listIconStrokeWidth}
            />
          </View>
        </View>
      )}

      {status === RecorderStatus.Recording && (
        <View style={styles.captureGroup}>
          <Text style={styles.duration} testID="record-duration">
            {formatDuration(elapsedMs)}
          </Text>
          <View style={styles.captureButtonsRow}>
            <TouchableOpacity
              style={styles.stopCircleButton}
              onPress={onStop}
              accessibilityRole="button"
              accessibilityLabel="Stop recording"
              testID="record-stop-button"
            >
              <Square
                size={26}
                color={theme.colors.foreground}
                strokeWidth={listIconStrokeWidth}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryActionCircle}
              onPress={onPause}
              accessibilityRole="button"
              accessibilityLabel="Pause recording"
              testID="record-pause-button"
            >
              <Pause
                size={30}
                color={theme.colors.primaryForeground}
                strokeWidth={listIconStrokeWidth}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.captureTip} testID="record-tip">
            Tap pause to study the source, stop to finish.
          </Text>
        </View>
      )}

      {status === RecorderStatus.Paused && (
        <View style={styles.captureGroup}>
          <Text style={styles.duration} testID="record-duration">
            {formatDuration(elapsedMs)}
          </Text>
          <View style={styles.captureButtonsRow}>
            {canResume ? (
              <>
                <TouchableOpacity
                  style={styles.stopCircleButton}
                  onPress={onStop}
                  accessibilityRole="button"
                  accessibilityLabel="Stop recording"
                  testID="record-stop-button"
                >
                  <Square
                    size={26}
                    color={theme.colors.foreground}
                    strokeWidth={listIconStrokeWidth}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryActionCircle}
                  onPress={onResume}
                  accessibilityRole="button"
                  accessibilityLabel="Resume recording"
                  testID="record-resume-button"
                >
                  <CircleDot
                    size={30}
                    color={theme.colors.primaryForeground}
                    strokeWidth={listIconStrokeWidth}
                  />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.destructiveButton}
                onPress={onDiscard}
                accessibilityRole="button"
                accessibilityLabel="Discard recovered take"
                testID="record-discard-button"
              >
                <Trash2
                  size={18}
                  color={theme.colors.destructive}
                  strokeWidth={listIconStrokeWidth}
                />
                <Text style={styles.destructiveLabel}>Discard take</Text>
              </TouchableOpacity>
            )}
          </View>
          {canResume && isRecovered && onDiscard ? (
            <TouchableOpacity
              style={styles.destructiveButton}
              onPress={onDiscard}
              accessibilityRole="button"
              accessibilityLabel="Discard recovered take"
              testID="record-discard-button"
            >
              <Trash2
                size={18}
                color={theme.colors.destructive}
                strokeWidth={listIconStrokeWidth}
              />
              <Text style={styles.destructiveLabel}>Discard take</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.captureTip} testID="record-tip">
            {pausedTip(canResume, isRecovered)}
          </Text>
        </View>
      )}

      {status === RecorderStatus.Review && (
        <View style={styles.reviewGroup}>
          <View style={styles.captureButtonsRow}>
            <View
              style={styles.mutedPlaceholderCircle}
              accessibilityRole="image"
              accessibilityLabel="Recording complete"
              testID="record-review-record-done-placeholder"
            >
              <CircleDot
                size={22}
                color={theme.colors.mutedForeground}
                strokeWidth={listIconStrokeWidth}
              />
            </View>
            <TouchableOpacity
              style={styles.primaryPlayCircle}
              onPress={onTogglePlayback}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause draft' : 'Play draft'}
              accessibilityState={{ selected: isPlaying }}
              testID="record-play-button"
            >
              {isPlaying ? (
                <Pause
                  size={30}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              ) : (
                <Play
                  size={30}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.reviewActions}>
            <TouchableOpacity
              style={styles.reRecordButton}
              onPress={onReRecord}
              accessibilityRole="button"
              accessibilityLabel="Re-record draft"
              testID="record-rerecord-button"
            >
              <RefreshCw
                size={18}
                color={theme.colors.foreground}
                strokeWidth={listIconStrokeWidth}
              />
              <Text style={styles.reRecordLabel}>Re-record</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.destructiveButton}
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete draft"
              testID="record-delete-button"
            >
              <Trash2
                size={18}
                color={theme.colors.destructive}
                strokeWidth={listIconStrokeWidth}
              />
              <Text style={styles.destructiveLabel}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  idleGroup: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  recordButtonCircle: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.recordAccent,
  },
  recordButtonLabel: {
    color: theme.colors.foreground,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    textAlign: 'center',
  },
  mutedPlaceholderCircle: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
    opacity: 0.6,
  },
  captureGroup: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  captureButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  captureTip: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
  duration: {
    fontSize: 32,
    fontWeight: theme.typography.weights.medium,
    fontVariant: ['tabular-nums'],
    color: theme.colors.mutedForeground,
  },
  stopCircleButton: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  primaryActionCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.recordAccent,
  },
  reviewGroup: {
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  primaryPlayCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  reRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cardBackground,
  },
  reRecordLabel: {
    color: theme.colors.foreground,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
  },
  destructiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    backgroundColor: theme.colors.background,
  },
  destructiveLabel: {
    color: theme.colors.destructive,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
  },
});
