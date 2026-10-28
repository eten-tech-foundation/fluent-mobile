import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  formatSyncStatusLabel,
  type SyncStatus,
} from '../../utils/syncStatusState';
import {
  CloudArrowDown,
  CloudArrowUp,
  CloudCheck,
  CloudSlash,
  CloudWarning,
  type NextIcon,
} from './icons';
import { RoundButton } from './RoundButton';

const STATUS_ICONS: Record<SyncStatus, NextIcon> = {
  online_synced: CloudCheck,
  online_syncing: CloudArrowUp,
  online_uploading: CloudArrowUp,
  online_pending: CloudArrowUp,
  online_needs_sync: CloudArrowDown,
  online_failed: CloudWarning,
  offline_synced: CloudSlash,
  offline_pending: CloudSlash,
};

/** The status alone, for a cloud that doesn't open the Sync page. */
const STATUS_NAMES: Record<SyncStatus, string> = {
  online_synced: 'Online · all synced',
  online_syncing: 'Syncing…',
  online_uploading: 'Syncing…',
  online_pending: 'Online · upload pending',
  online_needs_sync: 'Updates available',
  online_failed: 'Upload failed',
  offline_synced: 'Offline · nothing pending',
  offline_pending: 'Offline · upload pending',
};

export interface SyncStatusButtonProps {
  status: SyncStatus;
  /** Sanitized upload error, spoken when the status is online_failed. */
  failedErrorText?: string | null;
  /** Opens the Sync page; the spoken status says so only when it's given. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The header cloud: a soft Round button whose Phosphor cloud shows the sync
 * status (Figma Home · My work, node 2646:55).
 */
export function SyncStatusButton({
  status,
  failedErrorText,
  onPress,
  style,
  testID,
}: SyncStatusButtonProps) {
  return (
    <RoundButton
      icon={STATUS_ICONS[status]}
      accessibilityLabel={
        onPress
          ? formatSyncStatusLabel(status, { failedErrorText })
          : statusName(status, failedErrorText)
      }
      onPress={onPress}
      style={style}
      testID={testID}
    />
  );
}

function statusName(status: SyncStatus, failedErrorText?: string | null) {
  const name = STATUS_NAMES[status];
  return status === 'online_failed' && failedErrorText
    ? `${name}. ${failedErrorText}`
    : name;
}
