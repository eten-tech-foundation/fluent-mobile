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

export interface SyncStatusButtonProps {
  status: SyncStatus;
  /** Sanitized upload error, spoken when the status is online_failed. */
  failedErrorText?: string | null;
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
      accessibilityLabel={formatSyncStatusLabel(status, { failedErrorText })}
      onPress={onPress}
      style={style}
      testID={testID}
    />
  );
}
