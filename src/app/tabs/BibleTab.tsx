import React from 'react';
import { theme } from '../../theme';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder Bible tab. Full implementation lands in issue #48.
 */
export function BibleTab() {
  return (
    <View style={styles.container} testID="bible-tab-placeholder">
      <Text style={styles.title}>Bible tab</Text>
      <Text style={styles.body}>
        The Bible tab is built in issue #48. Use the Record tab to draft the
        currently selected verse.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  body: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
});
