import React from 'react';
import { theme } from '../../theme';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Empty stub. This is a mount point only — built out as part of a
 * separate Bible Tab ticket (verse list, source text, tap-to-select).
 */
export function BibleTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Bible tab</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  text: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
  },
});
