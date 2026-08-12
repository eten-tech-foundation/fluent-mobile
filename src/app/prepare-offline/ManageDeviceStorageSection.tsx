import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import {
  OFFLINE_STORAGE_DELETE_SELECTED,
  OFFLINE_STORAGE_EMPTY_OTHER_PROJECTS,
  OFFLINE_STORAGE_SELECT_TO_DELETE,
} from '../../constants/messages';
import { usePrepareOfflineStorageManagement } from '../../hooks/usePrepareOfflineStorageManagement';
import {
  formatAvailableDeviceStorage,
  formatByteSize,
  formatStorageCapacity,
} from '../../utils/formatByteSize';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { StorageProjectAccordion } from './StorageProjectAccordion';

interface ManageDeviceStorageSectionProps {
  projectId: number;
  /** Bumps when a prepare-offline download session settles (complete or cancelled). */
  inventoryRefreshSignal?: string;
  /** Disable delete while a prepare-offline download is active on this screen. */
  downloadInProgress?: boolean;
}

export function ManageDeviceStorageSection({
  projectId,
  inventoryRefreshSignal,
  downloadInProgress = false,
}: ManageDeviceStorageSectionProps) {
  const {
    summary,
    groups,
    initialLoaded,
    deleting,
    selectedIds,
    expandedProjectIds,
    bytesToFree,
    hasSelection,
    toggleResourceSelected,
    toggleProjectExpanded,
    requestDeleteSelected,
  } = usePrepareOfflineStorageManagement(projectId, inventoryRefreshSignal);

  const deleteDisabled = !hasSelection || deleting || downloadInProgress;

  const footerHint = hasSelection
    ? `${formatByteSize(bytesToFree)} to free`
    : OFFLINE_STORAGE_SELECT_TO_DELETE;

  return (
    <View style={styles.section} testID="manage-device-storage-section">
      <Text style={styles.sectionLabel}>MANAGE DEVICE STORAGE</Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Available on device</Text>
          <Text style={styles.summaryValue} testID="storage-available-bytes">
            {formatAvailableDeviceStorage(
              summary.availableBytes,
              summary.totalDeviceBytes,
            )}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Used by Fluent</Text>
          <Text style={styles.summaryValue} testID="storage-fluent-used-bytes">
            {formatStorageCapacity(summary.fluentUsedBytes)}
          </Text>
        </View>
      </View>

      {initialLoaded && groups.length === 0 ? (
        <Text style={styles.emptyMessage} testID="storage-empty-other-projects">
          {OFFLINE_STORAGE_EMPTY_OTHER_PROJECTS}
        </Text>
      ) : null}

      {groups.length > 0 ? (
        <View style={styles.accordions}>
          {groups.map(group => (
            <StorageProjectAccordion
              key={group.projectId}
              group={group}
              expanded={expandedProjectIds.has(group.projectId)}
              selectedIds={selectedIds}
              onToggleExpanded={() => toggleProjectExpanded(group.projectId)}
              onToggleResource={toggleResourceSelected}
            />
          ))}
        </View>
      ) : null}

      {initialLoaded && groups.length > 0 ? (
        <View style={styles.deleteFooter}>
          <Text style={styles.footerHint} testID="storage-bytes-to-free">
            {footerHint}
          </Text>
          <TouchableOpacity
            style={[
              styles.deleteButton,
              deleteDisabled && styles.deleteButtonDisabled,
            ]}
            onPress={requestDeleteSelected}
            disabled={deleteDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: deleteDisabled }}
            testID="storage-delete-selected-button"
          >
            <Trash2
              size={iconSizes.chapterSync}
              color={theme.colors.primaryForeground}
              strokeWidth={listIconStrokeWidth}
            />
            <Text style={styles.deleteButtonLabel}>
              {OFFLINE_STORAGE_DELETE_SELECTED}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: theme.spacing.xxl,
    paddingTop: theme.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  sectionLabel: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.mutedForeground,
    letterSpacing: 0.4,
  },
  summaryCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  summaryValue: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
  },
  emptyMessage: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  accordions: {
    gap: theme.spacing.sm,
  },
  deleteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  footerHint: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.destructive,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonLabel: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.primaryForeground,
  },
});
