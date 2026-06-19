import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { CloudSyncStatusIcon } from './CloudSyncStatusIcon';
import { theme, headerLayout, touchHitSlop } from '../../theme';
import { SyncStatus, SYNC_STATUS_LABELS } from '../../utils/syncStatusState';

interface TopBarSyncButtonProps {
  syncStatus: SyncStatus;
  onPress: () => void;
}

export function TopBarSyncButton({ syncStatus, onPress }: TopBarSyncButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.syncSlot}
      accessibilityLabel={SYNC_STATUS_LABELS[syncStatus]}
      accessibilityRole="button"
      hitSlop={touchHitSlop}
    >
      <CloudSyncStatusIcon status={syncStatus} decorative />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  syncSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    padding: 6,
  },
});
