import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrepareOfflineCatalog } from '../../types/prepareOffline/types';
import { theme } from '../../theme';
import { ResourceGroupDivider } from './ResourceGroupDivider';
import { ResourceItemRow } from './ResourceItemRow';
import { ResourceTierHeader } from './ResourceTierSection';

interface PrepareOfflineResourceSummaryProps {
  catalog: PrepareOfflineCatalog;
}

export function PrepareOfflineResourceSummary({
  catalog,
}: PrepareOfflineResourceSummaryProps) {
  if (catalog.groups.length === 0) {
    return null;
  }

  return (
    <View style={styles.card} testID="prepare-offline-resource-summary">
      <ResourceTierHeader tier={1} />
      {catalog.groups.map((group, index) => (
        <React.Fragment key={group.groupName}>
          {index > 0 ? <ResourceGroupDivider /> : null}
          <View style={styles.group}>
            <Text style={styles.groupName}>{group.groupName}</Text>
            {group.items.map(item => (
              <ResourceItemRow
                key={item.id}
                item={item}
                mode="summary"
                showTierLock
              />
            ))}
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  group: {
    gap: theme.spacing.xs,
  },
  groupName: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
});
