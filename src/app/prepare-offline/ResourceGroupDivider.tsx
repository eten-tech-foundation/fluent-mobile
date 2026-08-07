import React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../../theme';

/** Full-bleed horizontal rule inside padded resource cards (no horizontal inset). */
export function ResourceGroupDivider() {
  return (
    <View
      style={styles.divider}
      testID="resource-group-divider"
      accessibilityRole="none"
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: -theme.spacing.md,
  },
});
