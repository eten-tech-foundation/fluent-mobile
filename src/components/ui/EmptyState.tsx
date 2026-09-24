import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface EmptyStateProps {
  message: string;
  testID?: string;
}

export function EmptyState({ message, testID }: EmptyStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.xxl,
  },
  message: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.normal,
  },
});
