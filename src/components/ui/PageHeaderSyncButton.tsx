import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { CloudSyncStatusIcon } from './CloudSyncStatusIcon';
import { theme, headerLayout, touchHitSlop } from '../../theme';
import { SyncStatus, SYNC_STATUS_LABELS } from '../../utils/syncStatusState';

interface PageHeaderSyncButtonProps {
  syncStatus: SyncStatus;
  onPress: () => void;
  /** Cloud outline color — use foreground on white headers. */
  cloudColor?: string;
}

export function PageHeaderSyncButton({
  syncStatus,
  onPress,
  cloudColor,
}: PageHeaderSyncButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.syncSlot}
      accessibilityLabel={SYNC_STATUS_LABELS[syncStatus]}
      accessibilityRole="button"
      hitSlop={touchHitSlop}
      activeOpacity={0.7}
    >
      <CloudSyncStatusIcon
        status={syncStatus}
        decorative
        cloudColor={cloudColor}
      />
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
