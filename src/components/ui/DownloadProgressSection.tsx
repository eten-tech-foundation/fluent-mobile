import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowDownToLine, ChevronRight, Download } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import type { DownloadQueueSnapshot } from '../../types/download/types';

interface DownloadProgressSectionProps {
  snapshot: DownloadQueueSnapshot;
  onManageDownloads: () => void;
}

const BAR_HEIGHT = 8;

function getActiveItems(snapshot: DownloadQueueSnapshot) {
  return snapshot.items.filter(item => item.status !== 'completed');
}

export function DownloadProgressSection({
  snapshot,
  onManageDownloads,
}: DownloadProgressSectionProps) {
  const activeItems = getActiveItems(snapshot);
  if (activeItems.length === 0) {
    return null;
  }

  const remaining = Math.max(0, snapshot.totalCount - snapshot.completedCount);
  const percent = Math.round(snapshot.aggregateProgress * 100);

  return (
    <View style={styles.section} testID="download-progress-section">
      <View style={styles.header}>
        <ArrowDownToLine
          size={iconSizes.chapterSync}
          color={theme.colors.mutedForeground}
          strokeWidth={listIconStrokeWidth}
        />
        <Text style={styles.headerLabel}>Downloads</Text>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(100, Math.max(0, percent))}%` },
          ]}
        />
      </View>

      <Text style={styles.countLabel}>{remaining} items remaining</Text>

      <View style={styles.itemList}>
        {activeItems.map(item => (
          <View key={item.id} style={styles.row}>
            <Download
              size={iconSizes.chapterSync}
              color={theme.colors.mutedForeground}
              strokeWidth={listIconStrokeWidth}
            />
            <Text style={styles.rowLabel} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.rowPercent}>
              {Math.round(item.progress * 100)}%
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.manageCard}
        onPress={onManageDownloads}
        activeOpacity={theme.listCard.activeOpacity}
        testID="download-manage-press"
        accessibilityRole="button"
        accessibilityLabel="Manage downloads"
      >
        <Text style={styles.manageLabel}>Manage downloads</Text>
        <ChevronRight
          size={iconSizes.chevron}
          color={theme.colors.mutedForeground}
          strokeWidth={listIconStrokeWidth}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.cardBackground,
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  headerLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  track: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: theme.colors.primary,
    opacity: 0.7,
  },
  countLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    marginBottom: theme.spacing.xs,
  },
  itemList: {
    gap: 1,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 28,
  },
  rowLabel: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  rowPercent: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    minWidth: 36,
    textAlign: 'right',
  },
  manageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.listCard.backgroundColor,
    borderRadius: theme.listCard.borderRadius,
    borderWidth: 1,
    borderColor: theme.listCard.borderColor,
    paddingHorizontal: theme.listCard.paddingHorizontal,
    paddingVertical: theme.listCard.paddingVertical,
  },
  manageLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
