import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

/**
 * Drafting Resources tab chrome (Lovable third tab). Download/content
 * wiring is out of scope — placeholder keeps tab parity with the prototype.
 */
export function ResourcesTab() {
  return (
    <View style={styles.container} testID="resources-tab">
      <BookOpen
        size={iconSizes.phaseIconGlyph}
        color={theme.colors.mutedForeground}
        strokeWidth={listIconStrokeWidth}
      />
      <Text style={styles.title}>Resources</Text>
      <Text style={styles.body}>
        Translation resources for this chapter will show up here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xxl,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  body: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.normal,
  },
});
