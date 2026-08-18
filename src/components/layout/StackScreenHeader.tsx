import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SyncStatus, SYNC_STATUS_LABELS } from '../../utils/syncStatusState';
import { CloudSyncStatusIcon } from '../ui/CloudSyncStatusIcon';
import { theme } from '../../theme';
import { iconSizes, touchHitSlop } from '../../theme/iconSpecs';
import { AppHeader, HeaderBackButton } from './AppHeader';

interface StackScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onSyncPress?: () => void;
  syncStatus?: SyncStatus;
  subtitleLines?: number;
  backTestID?: string;
}

export function StackScreenHeader({
  title,
  subtitle,
  onBack,
  onSyncPress,
  syncStatus,
  subtitleLines = 1,
  backTestID,
}: StackScreenHeaderProps) {
  return (
    <AppHeader
      tone="surface"
      title={title}
      subtitle={subtitle}
      subtitleLines={subtitleLines}
      titleAlign="start"
      left={<HeaderBackButton onPress={onBack} testID={backTestID} />}
      right={
        onSyncPress && syncStatus ? (
          <TouchableOpacity
            onPress={onSyncPress}
            hitSlop={touchHitSlop}
            style={styles.syncButton}
            accessibilityRole="button"
            accessibilityLabel={SYNC_STATUS_LABELS[syncStatus]}
          >
            <CloudSyncStatusIcon status={syncStatus} decorative />
          </TouchableOpacity>
        ) : (
          <View style={styles.syncPlaceholder} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  syncButton: {
    borderRadius: theme.radius.full,
    padding: theme.spacing.xs + 2,
  },
  syncPlaceholder: {
    width: iconSizes.header + 12,
  },
});
