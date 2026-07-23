import { StyleSheet, View } from 'react-native';
import { theme } from '../../theme';
import { CloudSyncStatusIcon } from './CloudSyncStatusIcon';
import { SyncStatus } from '../../utils/syncStatusState';
import { SyncPageStatus } from '../../types/sync/types';

const INDICATOR_SIZE = 96;
const INDICATOR_CLOUD_COLOR = theme.colors.mutedForeground;

function resolveIconState(
  status: SyncPageStatus,
  isOnline: boolean,
  hasPendingUploads: boolean,
  hasFailedUploads: boolean,
  isUploading: boolean,
): { status: SyncStatus; animated: boolean } {
  if (isUploading || status === 'syncing') {
    // Lovable Sync page uses the spinning cloud-sync glyph for online-syncing.
    return { status: 'online_syncing', animated: true };
  }

  if (status === 'paused') {
    return { status: 'online_syncing', animated: false };
  }

  if (hasFailedUploads && isOnline) {
    return { status: 'online_failed', animated: false };
  }

  switch (status) {
    case 'pending':
      if (hasPendingUploads) {
        return {
          status: isOnline ? 'online_pending' : 'offline_pending',
          animated: false,
        };
      }
      return {
        status: isOnline ? 'online_synced' : 'offline_synced',
        animated: false,
      };
    case 'uploadComplete':
    case 'allComplete':
    default:
      return { status: 'online_synced', animated: false };
  }
}

interface SyncStatusIndicatorProps {
  status: SyncPageStatus;
  isOnline?: boolean;
  hasPendingUploads?: boolean;
  hasFailedUploads?: boolean;
  isUploading?: boolean;
}

export function SyncStatusIndicator({
  status,
  isOnline = true,
  hasPendingUploads = false,
  hasFailedUploads = false,
  isUploading = false,
}: SyncStatusIndicatorProps) {
  const { status: iconStatus, animated } = resolveIconState(
    status,
    isOnline,
    hasPendingUploads,
    hasFailedUploads,
    isUploading,
  );

  return (
    <View style={styles.circle}>
      <CloudSyncStatusIcon
        status={iconStatus}
        size={INDICATOR_SIZE * 0.5}
        animated={animated}
        cloudColor={INDICATOR_CLOUD_COLOR}
        decorative
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    borderRadius: INDICATOR_SIZE / 2,
    backgroundColor: theme.colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
