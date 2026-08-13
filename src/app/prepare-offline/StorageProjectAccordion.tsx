import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { OtherProjectStorageGroup } from '../../types/prepareOffline/types';
import { formatByteSize } from '../../utils/formatByteSize';
import { groupStorageResourcesByName } from '../../utils/groupStorageResourcesByName';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { StorageResourceRow } from './StorageResourceRow';

interface StorageProjectAccordionProps {
  group: OtherProjectStorageGroup;
  expanded: boolean;
  selectedIds: Set<string>;
  onToggleExpanded: () => void;
  onToggleResource: (resourceId: string) => void;
}

export function StorageProjectAccordion({
  group,
  expanded,
  selectedIds,
  onToggleExpanded,
  onToggleResource,
}: StorageProjectAccordionProps) {
  const resourceGroups = useMemo(
    () => groupStorageResourcesByName(group.resources),
    [group.resources],
  );

  return (
    <View style={styles.card} testID={`storage-project-${group.projectId}`}>
      <TouchableOpacity
        style={styles.header}
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.title}>{group.projectName}</Text>
        <Text style={styles.total}>{formatByteSize(group.totalBytes)}</Text>
        {expanded ? (
          <ChevronUp
            size={iconSizes.headerTab}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <ChevronDown
            size={iconSizes.headerTab}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
          />
        )}
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.resources}>
          {resourceGroups.map(resourceGroup => (
            <View key={resourceGroup.resourceName} style={styles.resourceGroup}>
              <Text style={styles.resourceGroupTitle}>
                {resourceGroup.resourceName}
              </Text>
              {resourceGroup.resources.map(resource => (
                <StorageResourceRow
                  key={resource.id}
                  resource={resource}
                  selected={selectedIds.has(resource.id)}
                  onToggle={() => onToggleResource(resource.id)}
                />
              ))}
            </View>
          ))}
        </View>
      ) : null}
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
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 40,
  },
  title: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  total: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  resources: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  resourceGroup: {
    gap: theme.spacing.xs,
  },
  resourceGroupTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
});
