import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pause, Play, RotateCw } from 'lucide-react-native';
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

/**
 * Fixed source-audio player bar, anchored above the bottom tab nav.
 * Always holds the full chapter audio (never a single verse clip).
 *
 * NOTE: Audio recording/playback is out of scope for this branch.
 * isPlaying/position below are local fake state only — there is no
 * audio library wired up yet. Replace with a real player hook later.
 */
export function SourceAudioPlayerBar({
  verses,
  selectedVerse,
}: SourceAudioPlayerBarProps) {
  // Stubbed load state. Flip to 'error' manually during dev to see the
  // error/retry UI; real loading will replace this with a real fetch.
  const [loadState, setLoadState] = useState<LoadState>('ready');
  const [isPlaying, setIsPlaying] = useState(false);

  const handleRetry = () => {
    setLoadState('ready');
  };

  const handleTogglePlay = () => {
    if (loadState !== 'ready') return;
    setIsPlaying(prev => !prev);
  };

  const handleTickPress = () => {
    // Scrubs playback to that verse's boundary. Does NOT change the
    // selected verse (selectedVerse only changes via explicit tap on
    // Bible Tab or prev/next on Record Tab).
    if (loadState !== 'ready') return;
    // Fake scrub: no real audio position to update yet.
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

  const isEmpty = loadState === 'loading';

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={handleTogglePlay}
        disabled={isEmpty}
        style={[styles.playButton, isEmpty && styles.playButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        hitSlop={touchHitSlop}
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
        {isEmpty ? (
          <View style={styles.waveformPlaceholder} />
        ) : (
          <View style={styles.waveformRow}>
            {verses.map(verse => (
              <Pressable
                key={verse.verseNumber}
                onPress={handleTickPress}
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
