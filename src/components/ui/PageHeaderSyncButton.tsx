import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { CloudSyncStatusIcon } from './CloudSyncStatusIcon';
import { theme, headerLayout, touchHitSlop } from '../../theme';
import { SyncStatus, formatSyncStatusLabel } from '../../utils/syncStatusState';

interface PageHeaderSyncButtonProps {
  syncStatus: SyncStatus;
  onPress: () => void;
  /** Cloud outline color — use foreground on white headers. */
  cloudColor?: string;
  /** Sanitized recordings.upload_error when status is online_failed. */
  failedErrorText?: string | null;
}

export function PageHeaderSyncButton({
  syncStatus,
  onPress,
  cloudColor,
  failedErrorText,
}: PageHeaderSyncButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.syncSlot}
      accessibilityLabel={formatSyncStatusLabel(syncStatus, {
        failedErrorText,
      })}
      accessibilityRole="button"
      hitSlop={touchHitSlop}
      activeOpacity={0.7}
      testID="home-sync-button"
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
