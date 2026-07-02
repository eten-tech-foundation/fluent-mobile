import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Play } from 'lucide-react-native';
import { theme } from '../../../theme';
import { iconSizes, listIconStrokeWidth } from '../../../theme/iconSpecs';

/**
 * Placeholder chapter audio player bar owned by drafting page shell #47.
 * Rendered here so #49 can be built and manually verified end-to-end; #47 will
 * replace it with a full-featured player.
 */
export function ChapterAudioPlayerBar() {
  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLabel="Chapter audio player — coming with issue #47"
      testID="chapter-audio-player-placeholder"
    >
      <View style={styles.playButton}>
        <Play
          size={iconSizes.chevron}
          color={theme.colors.mutedForeground}
          strokeWidth={listIconStrokeWidth}
        />
      </View>
      <View style={styles.waveformStub}>
        <Text style={styles.label}>Chapter audio · coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.border,
  },
  waveformStub: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  label: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
});
