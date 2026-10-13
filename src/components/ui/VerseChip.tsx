import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '../../theme/useTheme';

/** Figma Verse chip: 24 × 24. Waveform lays out around this size. */
export const VERSE_CHIP_SIZE = 24;

export interface VerseChipProps {
  verse: number;
  /** Playback has reached this verse (Figma Current); otherwise Default. */
  current: boolean;
  testID?: string;
}

/**
 * Verse number at the start of each waveform segment (Figma Verse chip,
 * node 2409:502). Decorative: the waveform carries the accessible progress.
 */
export function VerseChip({ verse, current, testID }: VerseChipProps) {
  const styles = useThemedStyles(t => ({
    chip: {
      width: VERSE_CHIP_SIZE,
      height: VERSE_CHIP_SIZE,
      borderRadius: t.radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.roles.surfaceInverseMuted,
    },
    current: { backgroundColor: t.roles.surfaceInverse },
    label: {
      color: t.roles.fgOnInverse,
      fontSize: t.typography.sizes.sm,
      lineHeight: t.typography.lineHeights.tight,
      fontWeight: t.typography.weights.semibold,
      includeFontPadding: false,
    },
  }));

  return (
    <View style={[styles.chip, current && styles.current]} testID={testID}>
      <Text style={styles.label} maxFontSizeMultiplier={1}>
        {verse}
      </Text>
    </View>
  );
}
