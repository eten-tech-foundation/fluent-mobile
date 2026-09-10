import React from 'react';
import { Pause, Play, RotateCw } from 'lucide-react-native';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  theme,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme';
import type { SourceAudioLoadState } from '../../types/sourceAudio';
import { PlaybackProgressBar } from '../ui/PlaybackProgressBar';

export type { SourceAudioLoadState } from '../../types/sourceAudio';

interface SourceAudioPlayerBarProps {
  /** Short bible label in the footer (e.g. BSB). */
  sourceLabel?: string;
  /** Verse-mode unit counter (e.g. `Verse 3 / 12`). */
  unitCaption?: string;
  loadState?: SourceAudioLoadState;
  isPlaying?: boolean;
  isLoadingAudio?: boolean;
  positionMs?: number;
  durationMs?: number;
  onPlayPause?: () => void | Promise<void>;
  onSeek?: (positionMs: number) => void | Promise<void>;
  onRetry?: () => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatFooterLabel(sourceLabel: string, unitCaption: string): string {
  return `${sourceLabel} Source Audio · ${unitCaption}`;
}

/**
 * Shell-level source-audio player for Bible + Record tabs (#412).
 * Playback state is controlled by the parent hook (#235 / #449).
 */
export function SourceAudioPlayerBar({
  sourceLabel = 'Source',
  unitCaption = '',
  loadState = 'empty',
  isPlaying = false,
  isLoadingAudio = false,
  positionMs = 0,
  durationMs = 0,
  onPlayPause,
  onSeek,
  onRetry,
}: SourceAudioPlayerBarProps) {
  if (loadState === 'error') {
    return (
      <View style={styles.bar} testID="source-audio-bar">
        <Text style={styles.errorText}>Couldn't load source audio</Text>
        <Pressable
          onPress={() => onRetry?.()}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Retry loading source audio"
          hitSlop={touchHitSlop}
        >
          <RotateCw
            size={iconSizes.headerTab}
            color={theme.colors.primary}
            strokeWidth={listIconStrokeWidth}
          />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (loadState === 'empty') {
    return (
      <View style={styles.emptyBar} testID="source-audio-bar">
        <Text
          style={[styles.captionLabel, styles.captionLabelEmpty]}
          testID="source-audio-label"
        >
          No source audio
        </Text>
      </View>
    );
  }

  if (loadState === 'loading') {
    return (
      <View style={styles.bar} testID="source-audio-bar">
        <View style={styles.loadingContent}>
          <ActivityIndicator
            size="small"
            color={theme.colors.primary}
            testID="source-audio-loading"
          />
        </View>
        <Text style={styles.captionLabel} testID="source-audio-label">
          Loading source audio...
        </Text>
      </View>
    );
  }

  const footerLabel = unitCaption
    ? formatFooterLabel(sourceLabel, unitCaption)
    : `${sourceLabel} Source Audio`;
  const elapsedLabel = formatDuration(positionMs);
  const durationLabel = durationMs > 0 ? formatDuration(durationMs) : '--:--';
  const playAccessibilityLabel = isLoadingAudio
    ? 'Loading audio'
    : isPlaying
    ? 'Pause source audio'
    : 'Play source audio';

  return (
    <View style={styles.bar} testID="source-audio-bar">
      <View style={styles.controlsRow}>
        <Pressable
          onPress={() => {
            void onPlayPause?.();
          }}
          disabled={!onPlayPause || isLoadingAudio}
          style={styles.playButton}
          accessibilityRole="button"
          accessibilityLabel={playAccessibilityLabel}
          android_ripple={{ color: 'transparent' }}
          testID="source-audio-play"
        >
          {isLoadingAudio ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.primaryForeground}
              testID="source-audio-play-loading"
            />
          ) : isPlaying ? (
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
        </Pressable>

        <View style={styles.waveformArea}>
          <View style={styles.waveformRow} testID="source-audio-waveform">
            <PlaybackProgressBar
              positionMs={positionMs}
              durationMs={durationMs}
              barCount={56}
              accentColor={theme.colors.waveformActive}
              idleColor={theme.colors.waveformIdle}
              rowHeight={theme.waveform.sourceDockHeight}
              showPlayhead
              accessibilityLabel="Source audio waveform scrubber"
              onSeek={position => {
                void onSeek?.(position);
              }}
            />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText} testID="source-audio-time-elapsed">
              {elapsedLabel}
            </Text>
            <Text style={styles.timeText} testID="source-audio-time-duration">
              {durationLabel}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.spacer} />

      <Text style={styles.captionLabel} testID="source-audio-label">
        {footerLabel}
      </Text>
    </View>
  );
}

const TOUCH_TARGET = theme.recordControlSizes.secondary;

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    width: '100%',
  },
  emptyBar: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
    paddingTop: 0,
    paddingBottom: 0,
  },
  captionLabelEmpty: {
    // Mantém o mesmo padding em ambos os estados
  },
  spacer: {
    height: theme.spacing.md,
  },
  loadingContent: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    width: '100%',
  },
  playButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  waveformArea: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  waveformRow: {
    width: '100%',
    height: theme.waveform.sourceDockHeight,
    justifyContent: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  timeText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  retryText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.primary,
  },
});
