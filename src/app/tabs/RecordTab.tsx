import React from 'react';
import { theme } from '../../theme';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Empty stub. This is a mount point only — built out as part of a
 * separate Record Tab ticket (record/stop, recorded playback, delete,
 * prev/next), once audio recording lands in this app.
 *
 * Not derived from the existing ViewChapter.tsx — that file is left
 * untouched and unreferenced; it belongs to whoever picks up the
 * Record Tab ticket to retire or reuse as they see fit.
 */
export function RecordTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Record tab</Text>
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
