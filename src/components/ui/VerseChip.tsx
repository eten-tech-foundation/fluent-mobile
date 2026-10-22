import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '../../theme/useTheme';

/** Figma Verse chip: 24 × 24. Waveform lays out around these widths. */
export const VERSE_CHIP_SIZE = 24;
/** Three-digit verses (Psalm 119:176) don't fit 24 at 14pt semibold. */
const VERSE_CHIP_WIDE = 32;

export function verseChipWidth(verse: number) {
  return verse >= 100 ? VERSE_CHIP_WIDE : VERSE_CHIP_SIZE;
}

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
    <View
      style={[
        styles.chip,
        { width: verseChipWidth(verse) },
        current && styles.current,
      ]}
      testID={testID}
    >
      {/* Fixed size: the chip is hidden from TalkBack and the waveform lays
          out around it, so it doesn't scale with the font size setting. */}
      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1}>
        {verse}
      </Text>
    </View>
  );
}
