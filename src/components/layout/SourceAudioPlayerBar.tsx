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
}

export function SourceAudioPlayerBar({
  verses,
  selectedVerse,
}: SourceAudioPlayerBarProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [isPlaying, setIsPlaying] = useState(false);

  const handleRetry = () => {
    setLoadState('loading');
  };

  const handleTogglePlay = () => {
    if (loadState !== 'ready') return;
    setIsPlaying(prev => !prev);
  };

  const handleTickPress = () => {
    if (loadState !== 'ready') return;
  };

  if (loadState === 'error') {
    return (
      <View style={styles.bar}>
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

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={handleTogglePlay}
        disabled={isLoading}
        style={[styles.playButton, isLoading && styles.playButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
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
          <View style={styles.waveformRow}>
            {verses.map(verse => (
              <Pressable
                key={verse.verseNumber}
                onPress={handleTickPress}
                disabled={isLoading}
                style={styles.tickWrapper}
                accessibilityRole="button"
                accessibilityLabel={`Scrub to verse ${verse.verseNumber}`}
              >
                <View
                  style={[
                    styles.tick,
                    verse.verseNumber === selectedVerse && styles.tickActive,
                  ]}
                />
              </Pressable>
            ))}
          </View>
        )}
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
    height: TOUCH_TARGET,
    justifyContent: 'center',
  },
  waveformPlaceholder: {
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickWrapper: {
    flex: 1,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: 2,
    height: 20,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
  },
  tickActive: {
    backgroundColor: theme.colors.primary,
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