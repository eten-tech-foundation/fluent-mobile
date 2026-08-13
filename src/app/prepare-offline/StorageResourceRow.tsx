import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { StorageInventoryResource } from '../../types/prepareOffline/types';
import { formatByteSize } from '../../utils/formatByteSize';
import { kindLabel } from '../../utils/prepareOfflineResourceId';
import { theme } from '../../theme';
import { SelectionCheckbox } from './SelectionCheckbox';

interface StorageResourceRowProps {
  resource: StorageInventoryResource;
  selected: boolean;
  onToggle: () => void;
}

export function StorageResourceRow({
  resource,
  selected,
  onToggle,
}: StorageResourceRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      testID={`storage-resource-row-${resource.id}`}
    >
      <SelectionCheckbox selected={selected} showCheck={selected} />
      <Text style={styles.label}>{kindLabel(resource.kind)}</Text>
      <Text style={styles.size}>{formatByteSize(resource.bytes)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    gap: theme.spacing.sm,
  },
  label: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
  },
  size: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    minWidth: 56,
    textAlign: 'right',
  },
});
