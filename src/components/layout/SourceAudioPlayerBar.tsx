import React, { useState } from 'react';
import { Pause, Play, RotateCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  theme,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme';
import { VerseData } from '../../types/db/types';

type LoadState = 'loading' | 'ready' | 'error';

interface SourceAudioPlayerBarProps {
  verses: VerseData[];
  selectedVerse: number;
  /** Bible / source name shown in the footer label (e.g. BSB). */
  sourceLabel?: string;
}

/**
 * Bottom source-audio strip for Record tab idle/review (design 01 / 04).
 * Playback wiring is still a stub — UI matches the design panel chrome.
 */
export function SourceAudioPlayerBar({
  verses,
  selectedVerse,
  sourceLabel = 'Source',
}: SourceAudioPlayerBarProps) {
  // Decorative ready state until real source-audio playback lands.
  const [loadState, setLoadState] = useState<LoadState>('ready');
  const [isPlaying, setIsPlaying] = useState(false);

  const handleRetry = () => {
    setLoadState('ready');
  };

  const handleTogglePlay = () => {
    if (loadState !== 'ready') return;
    setIsPlaying(prev => !prev);
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
  const barCount = 40;
  const step = Math.max(1, Math.floor(verses.length / 6) || 1);
  const markers = verses.filter((_, i) => i % step === 0).slice(0, 8);
  const selectedIndex = verses.findIndex(v => v.verseNumber === selectedVerse);

  return (
    <View style={styles.bar} testID="source-audio-bar">
      <Pressable
        onPress={handleTogglePlay}
        disabled={isLoading}
        style={[styles.playButton, isLoading && styles.playButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={
          isPlaying ? 'Pause source audio' : 'Play source audio'
        }
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
        {isLoading ? (
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
            <View style={styles.waveformRow}>
              {Array.from({ length: barCount }, (_, i) => {
                const height = 8 + ((i * 11) % 20);
                const active =
                  verses.length === 0
                    ? false
                    : Math.floor((i / barCount) * verses.length) <=
                      Math.max(0, selectedIndex);
                return (
                  <View
                    key={i}
                    style={[
                      styles.waveBar,
                      { height },
                      active ? styles.waveBarActive : styles.waveBarIdle,
                    ]}
                  />
                );
              })}
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>0:00</Text>
              <Text style={styles.timeText}>—</Text>
            </View>
          </>
        )}
        <Text style={styles.footerLabel} testID="source-audio-label">
          {sourceLabel} Source Audio · Verse {selectedVerse}
        </Text>
      </View>
    </View>
  );
}

const TOUCH_TARGET = 48;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  playButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonDisabled: {
    backgroundColor: theme.colors.mutedForeground,
  },
  waveformArea: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  waveformPlaceholder: {
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
  },
  markerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  marker: {
    fontSize: 10,
    color: theme.colors.mutedForeground,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 1,
  },
  waveBar: {
    flex: 1,
    maxWidth: 3,
    borderRadius: 1,
    backgroundColor: theme.colors.primary,
  },
  waveBarActive: {
    opacity: 1,
  },
  waveBarIdle: {
    opacity: 0.45,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
