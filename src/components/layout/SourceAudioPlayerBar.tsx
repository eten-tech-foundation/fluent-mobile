import React from 'react';
import { Pause, Play, RotateCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  /** Bible / source name shown in the footer label (e.g. BSB). */
  sourceLabel?: string;
  /**
   * Unit caption after the middle-dot (e.g. `Verse 3` or `Pericope 2 / 4`).
   * Matches Lovable drafting dock chrome.
   */
  unitCaption?: string;
  loadState?: SourceAudioLoadState;
  isPlaying?: boolean;
  positionMs?: number;
  durationMs?: number;
  onPlayPause?: () => void;
  onSeek?: (positionMs: number) => void;
  onRetry?: () => void;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Bottom source-audio strip for Record tab idle/review (Lovable drafting dock).
 * Playback is controlled by the parent via useSourceAudio (#235).
 */
export function SourceAudioPlayerBar({
  sourceLabel = 'Source',
  unitCaption,
  loadState = 'empty',
  isPlaying = false,
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

  const isLoading = loadState === 'loading';
  const isEmpty = loadState === 'empty';
  const isReady = loadState === 'ready';
  const playDisabled = !isReady || !onPlayPause;
  /** Empty/loading chrome: same dock layout as ready, muted (no primary blue). */
  const showMutedChrome = isLoading || isEmpty;

  const footerLabel = isLoading
    ? 'Loading source audio…'
    : isEmpty
    ? 'No source audio'
    : unitCaption
    ? `${sourceLabel} Source Audio · ${unitCaption}`
    : `${sourceLabel} Source Audio`;

  return (
    <View style={styles.bar} testID="source-audio-bar">
      <Pressable
        onPress={() => onPlayPause?.()}
        disabled={playDisabled}
        style={[styles.playButton, playDisabled && styles.playButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={
          isPlaying ? 'Pause source audio' : 'Play source audio'
        }
        accessibilityState={{ disabled: playDisabled }}
        android_ripple={{ color: 'transparent' }}
        testID="source-audio-play"
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
      </Pressable>

      <View style={styles.waveformArea}>
        <View style={styles.waveformRow} testID="source-audio-waveform">
          {showMutedChrome ? (
            <View
              style={styles.emptyTrack}
              accessibilityRole="progressbar"
              accessibilityState={{ disabled: true }}
              testID="source-audio-empty-track"
            >
              {Array.from({ length: 48 }, (_, i) => (
                <View key={i} style={styles.emptyTrackDash} />
              ))}
            </View>
          ) : (
            <PlaybackProgressBar
              positionMs={positionMs}
              durationMs={durationMs}
              barCount={64}
              accentColor={theme.colors.waveformActive}
              idleColor={theme.colors.waveformIdle}
              rowHeight={theme.waveform.sourceDockHeight}
              showPlayhead
              accessibilityLabel="Source audio waveform scrubber"
              onSeek={onSeek}
            />
          )}
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText} testID="source-audio-time">
            {showMutedChrome ? '0:00' : formatDuration(positionMs)}
          </Text>
          <Text style={styles.timeText} testID="source-audio-duration">
            {showMutedChrome || durationMs <= 0
              ? '--:--'
              : formatDuration(durationMs)}
          </Text>
        </View>
        <Text style={styles.footerLabel} testID="source-audio-label">
          {footerLabel}
        </Text>
      </View>
    </View>
  );
}

const TOUCH_TARGET = theme.recordControlSizes.secondary;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.cardBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
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
  playButtonDisabled: {
    backgroundColor: theme.colors.mutedForeground,
  },
  waveformArea: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  waveformRow: {
    width: '100%',
    height: theme.waveform.sourceDockHeight,
    justifyContent: 'center',
  },
  /** Empty/loading: flat dashed track (no decorative amplitude spikes). */
  emptyTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: theme.waveform.playheadWidth,
  },
  emptyTrackDash: {
    width: theme.waveform.emptyDashWidth,
    height: theme.waveform.playheadWidth,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
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
  footerLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
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
