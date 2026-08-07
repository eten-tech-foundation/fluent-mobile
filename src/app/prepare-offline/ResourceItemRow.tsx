import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CircleCheck, Download, Lock } from 'lucide-react-native';
import {
  PrepareOfflineResourceItem,
  PrepareOfflineResourceStatus,
} from '../../types/prepareOffline/types';
import { formatByteSize } from '../../utils/formatByteSize';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { SelectionCheckbox } from './SelectionCheckbox';
import { ResourceDownloadProgressRing } from './ResourceDownloadProgressRing';

interface ResourceItemRowProps {
  item: PrepareOfflineResourceItem;
  /** Summary rows are read-only; customize rows may show toggles. */
  mode: 'summary' | 'customize';
  selected?: boolean;
  locked?: boolean;
  /** Tier 1 required lock; completed tier 2/3 show green check instead. */
  showTierLock?: boolean;
  onToggle?: () => void;
}

function statusTestId(status: PrepareOfflineResourceStatus): string {
  if (status === 'completed') {
    return 'resource-status-completed';
  }

  if (status === 'downloading') {
    return 'resource-status-downloading';
  }

  return 'resource-status-pending';
}

function StatusIcon({ status }: { status: PrepareOfflineResourceStatus }) {
  if (status === 'completed') {
    return (
      <CircleCheck
        size={iconSizes.chapterSync}
        color={theme.colors.syncSynced}
        strokeWidth={listIconStrokeWidth}
        testID={statusTestId(status)}
      />
    );
  }

  if (status === 'selected' || status === 'available') {
    return (
      <Download
        size={iconSizes.chapterSync}
        color={theme.colors.mutedForeground}
        strokeWidth={listIconStrokeWidth}
        testID={statusTestId(status)}
      />
    );
  }

  return <View style={styles.statusSpacer} />;
}

function CustomizeLeadingIcon({
  locked,
  showTierLock,
  selected,
  status,
}: {
  locked: boolean;
  showTierLock: boolean;
  selected: boolean;
  status: PrepareOfflineResourceStatus;
}) {
  if (locked && showTierLock) {
    return (
      <Lock
        size={iconSizes.chapterSync}
        color={theme.colors.mutedForeground}
        strokeWidth={listIconStrokeWidth}
        testID="resource-customize-tier-lock"
      />
    );
  }

  if (locked && status === 'completed') {
    return (
      <CircleCheck
        size={iconSizes.chapterSync}
        color={theme.colors.syncSynced}
        strokeWidth={listIconStrokeWidth}
        testID="resource-customize-on-device-check"
      />
    );
  }

  return <SelectionCheckbox selected={selected} showCheck={selected} />;
}

export function ResourceItemRow({
  item,
  mode,
  selected = true,
  locked = false,
  showTierLock = false,
  onToggle,
}: ResourceItemRowProps) {
  const showToggle = mode === 'customize';
  const isDownloading = item.status === 'downloading';
  const displayBytes = item.bytes;

  const rowContent = (
    <>
      {showToggle ? (
        <View style={styles.leadingIconWrap}>
          <CustomizeLeadingIcon
            locked={locked}
            showTierLock={showTierLock}
            selected={selected}
            status={item.status}
          />
        </View>
      ) : null}

      {mode === 'summary' ? (
        <View style={styles.leadingIconWrap}>
          {showTierLock && item.status !== 'completed' && !isDownloading ? (
            <Lock
              size={iconSizes.chapterSync}
              color={theme.colors.mutedForeground}
              strokeWidth={listIconStrokeWidth}
              testID="resource-summary-tier-lock"
            />
          ) : !isDownloading ? (
            <StatusIcon status={item.status} />
          ) : (
            <View style={styles.statusSpacer} />
          )}
        </View>
      ) : null}

      <Text style={styles.label}>{item.label}</Text>

      <View style={styles.trailingWrap}>
        {isDownloading ? (
          <ResourceDownloadProgressRing progress={item.progress ?? 0} />
        ) : null}
        <Text style={styles.size} testID={`resource-row-size-${item.id}`}>
          {formatByteSize(displayBytes)}
        </Text>
      </View>
    </>
  );

  if (showToggle && onToggle && !locked) {
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        testID={`resource-row-${item.id}`}
      >
        {rowContent}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.row} testID={`resource-row-${item.id}`}>
      {rowContent}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    gap: theme.spacing.sm,
  },
  leadingIconWrap: {
    width: 20,
    alignItems: 'center',
  },
  label: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
  },
  trailingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  size: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    minWidth: 48,
    textAlign: 'right',
  },
  statusSpacer: {
    width: iconSizes.chapterSync,
  },
});
