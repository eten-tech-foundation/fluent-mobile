import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { theme } from '../../../../../theme';
import { iconSizes, listIconStrokeWidth } from '../../../../../theme/iconSpecs';

interface VerseNavProps {
  reference: string;
  prevDisabled: boolean;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function VerseNav({
  reference,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
}: VerseNavProps) {
  return (
    <View style={styles.verseNav}>
      <TouchableOpacity
        onPress={onPrev}
        accessibilityRole="button"
        accessibilityLabel="Previous verse"
        accessibilityState={{ disabled: prevDisabled }}
        disabled={prevDisabled}
        style={styles.verseNavButton}
        testID="record-prev-verse"
      >
        <ChevronLeft
          size={iconSizes.header}
          color={
            prevDisabled
              ? theme.colors.mutedForeground
              : theme.colors.foreground
          }
          strokeWidth={listIconStrokeWidth}
          style={prevDisabled ? styles.disabledIcon : undefined}
        />
      </TouchableOpacity>
      <Text style={styles.verseReference} testID="record-verse-reference">
        {reference}
      </Text>
      <TouchableOpacity
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel="Next verse"
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        style={styles.verseNavButton}
        testID="record-next-verse"
      >
        <ChevronRight
          size={iconSizes.header}
          color={
            nextDisabled
              ? theme.colors.mutedForeground
              : theme.colors.foreground
          }
          strokeWidth={listIconStrokeWidth}
          style={nextDisabled ? styles.disabledIcon : undefined}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  verseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  verseNavButton: {
    padding: theme.spacing.sm,
  },
  verseReference: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  disabledIcon: {
    opacity: 0.35,
  },
});
