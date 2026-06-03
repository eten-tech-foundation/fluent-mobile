import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CloudOff } from 'lucide-react-native';
import { theme, iconSizes, lucideStrokeWidth } from '../../theme';

export function SourceNotDownloadedChip() {
  return (
    <View style={styles.chip}>
      <CloudOff
        size={iconSizes.sourceChip}
        color={theme.colors.sourceChipText}
        strokeWidth={lucideStrokeWidth}
      />
      <Text style={styles.label}>Source not downloaded</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.sourceChipBorder,
  },
  label: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.sourceChipText,
    fontWeight: theme.typography.weights.medium,
  },
});
