import React, { useEffect, useState } from 'react';
import { Pause, Play, RotateCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  theme,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme';
import { VerseData } from '../../types/db/types';
import { PlaybackProgressBar } from '../ui/PlaybackProgressBar';

export type SourceAudioLoadState = 'loading' | 'ready' | 'empty' | 'error';

interface SourceAudioPlayerBarProps {
  verses: VerseData[];
  selectedVerse: number;
  /** Bible / source name shown in the footer label (e.g. BSB). */
  sourceLabel?: string;
  /**
   * Source-audio availability. Playback is still a **stub** — chrome matches
   * Lovable; times and the play toggle are decorative until source audio is
   * wired to a real player.
   */
  loadState?: SourceAudioLoadState;
}

/**
 * Bottom source-audio strip for Record tab idle/review (design 01 / 04).
 *
 * STUB: play control, waveform progress, and `0:00` / `--:--` are decorative.
 * They do **not** reflect real source-audio duration or position. Draft take
 * review time lives on `DraftTakeRow` (engine-backed).
 */
export function SourceAudioPlayerBar({
  verses,
  selectedVerse,
  sourceLabel = 'Source',
  // Default empty until #235 wires real source audio (avoid fake "ready" chrome).
  loadState: loadStateProp = 'empty',
}: SourceAudioPlayerBarProps) {
  const [loadState, setLoadState] =
    useState<SourceAudioLoadState>(loadStateProp);
  /** Decorative only — does not drive audio. */
  const [isPlayingVisual, setIsPlayingVisual] = useState(false);

  useEffect(() => {
    setLoadState(loadStateProp);
    setIsPlayingVisual(false);
  }, [loadStateProp, selectedVerse]);

  const handleRetry = () => {
    setLoadState(loadStateProp === 'empty' ? 'empty' : 'ready');
  };

  const handleTogglePlay = () => {
    if (loadState !== 'ready') return;
    // Stub: toggle chrome only. No player / no advancing timer.
    setIsPlayingVisual(prev => !prev);
  };

  if (loadState === 'error') {
    return (
      <View style={styles.bar} testID="source-audio-bar">
        <Text style={styles.errorText}>Couldn't load source audio</Text>
        <Pressable
          onPress={handleRetry}
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
  const playDisabled = isLoading || isEmpty;
  const step = Math.max(1, Math.floor(verses.length / 6) || 1);
  const markers = verses.filter((_, i) => i % step === 0).slice(0, 8);
  // Decorative progress keyed to selected verse index — not clock time.
  const selectedIndex = verses.findIndex(v => v.verseNumber === selectedVerse);
  const stubProgressMs =
    verses.length > 0 && selectedIndex >= 0
      ? ((selectedIndex + 1) / verses.length) * 1000
      : 0;

  const footerLabel = isLoading
    ? 'Loading source audio…'
    : isEmpty
    ? 'No source audio'
    : `${sourceLabel} Source Audio · Verse ${selectedVerse}`;

  return (
    <View style={styles.bar} testID="source-audio-bar">
      <Pressable
        onPress={handleTogglePlay}
        disabled={playDisabled}
        style={[styles.playButton, playDisabled && styles.playButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={
          isPlayingVisual
            ? 'Pause source audio (not wired yet)'
            : 'Play source audio (not wired yet)'
        }
        accessibilityState={{ disabled: playDisabled }}
        android_ripple={{ color: 'transparent' }}
        testID="source-audio-play-stub"
      >
        {isPlayingVisual ? (
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
        {isLoading || isEmpty ? (
          <View style={styles.waveformPlaceholder} />
        ) : (
          <>
            <View style={styles.markerRow}>
              {markers.map(verse => (
                <Text key={verse.verseNumber} style={styles.marker}>
                  {verse.verseNumber}
                </Text>
              ))}
            </View>
            <View style={styles.waveformRow} testID="source-audio-waveform">
              <PlaybackProgressBar
                positionMs={stubProgressMs}
                durationMs={1000}
                barCount={56}
                accentColor={theme.colors.waveformActive}
              />
            </View>
            <View style={styles.timeRow}>
              {/* Hardcoded stub times — not engine position/duration. */}
              <Text style={styles.timeText} testID="source-audio-time-stub">
                0:00
              </Text>
              <Text style={styles.timeText}>--:--</Text>
            </View>
          </>
        )}
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
    gap: theme.spacing.sm,
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
    gap: 2,
  },
  waveformPlaceholder: {
    height: 4,
    width: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
  },
  markerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  marker: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
  waveformRow: {
    width: '100%',
    height: 28,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  timeText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
  footerLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    marginTop: 2,
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
