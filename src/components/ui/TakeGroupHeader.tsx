import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { User } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

type TakeGroupHeaderProps = { displayName: string };

export function TakeGroupHeader({ displayName }: TakeGroupHeaderProps) {
  return (
    <View style={styles.row} testID="take-group-header">
      <User
        size={iconSizes.chevron}
        color={theme.colors.mutedForeground}
        strokeWidth={listIconStrokeWidth}
      />
      <Text style={styles.name} testID="take-group-header-name">
        {displayName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  name: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
});
