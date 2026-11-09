import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  formatSyncStatusLabel,
  SYNC_STATUS_HELD_FOR_DRAFTING,
  SYNC_STATUS_HELD_FOR_DRAFTING_SHORT,
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
  /** Pending uploads are waiting for drafting to end: a visible word + label. */
  heldForDrafting?: boolean;
  /** Opens the Sync page; the spoken status says so only when it's given. */
  onPress?: () => void;
  /** Flat on a dark hero, like its Back. */
  variant?: 'soft' | 'flat';
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
  heldForDrafting,
  onPress,
  variant,
  style,
  testID,
}: SyncStatusButtonProps) {
  const held = status === 'online_pending' && heldForDrafting;
  return (
    <RoundButton
      variant={variant}
      icon={STATUS_ICONS[status]}
      label={held ? SYNC_STATUS_HELD_FOR_DRAFTING_SHORT : undefined}
      accessibilityLabel={
        onPress
          ? formatSyncStatusLabel(status, { failedErrorText, heldForDrafting })
          : statusName(status, failedErrorText, heldForDrafting)
      }
      onPress={onPress}
      style={style}
      testID={testID}
    />
  );
}

function statusName(
  status: SyncStatus,
  failedErrorText?: string | null,
  heldForDrafting?: boolean,
) {
  if (status === 'online_pending' && heldForDrafting) {
    return SYNC_STATUS_HELD_FOR_DRAFTING;
  }
  const name = STATUS_NAMES[status];
  return status === 'online_failed' && failedErrorText
    ? `${name}. ${failedErrorText}`
    : name;
}
