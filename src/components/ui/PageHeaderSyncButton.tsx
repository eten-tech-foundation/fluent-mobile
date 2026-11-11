import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { CloudSyncStatusIcon } from './CloudSyncStatusIcon';
import { theme, headerLayout, touchHitSlop } from '../../theme';
import { SyncStatus, formatSyncStatusLabel } from '../../utils/syncStatusState';

interface PageHeaderSyncButtonProps {
  syncStatus: SyncStatus;
  onPress: () => void;
  onPressIn?: () => void;
  /** Cloud outline color — use foreground on white headers. */
  cloudColor?: string;
  /** Sanitized recordings.upload_error when status is online_failed. */
  failedErrorText?: string | null;
  /** Pending uploads are waiting for drafting to end; changes the spoken label. */
  heldForDrafting?: boolean;
}

export function PageHeaderSyncButton({
  syncStatus,
  onPress,
  onPressIn,
  cloudColor,
  failedErrorText,
  heldForDrafting,
}: PageHeaderSyncButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={onPressIn}
      style={styles.syncSlot}
      accessibilityLabel={formatSyncStatusLabel(syncStatus, {
        failedErrorText,
        heldForDrafting,
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
