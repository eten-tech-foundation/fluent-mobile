import { View } from 'react-native';
import { useTheme, useThemedStyles } from '../../theme/useTheme';
import { CloudSyncStatusIcon } from './CloudSyncStatusIcon';
import { SyncStatus } from '../../utils/syncStatusState';
import { SyncPageStatus } from '../../types/sync/types';

const INDICATOR_SIZE = 96;

function resolveIconState(
  status: SyncPageStatus,
  isOnline: boolean,
  hasPendingUploads: boolean,
  hasFailedUploads: boolean,
  isUploading: boolean,
  isMetadataSyncing = false,
  hasHeldRecordings = false,
): { status: SyncStatus; animated: boolean } {
  if (isUploading || status === 'syncing' || isMetadataSyncing) {
    // Lovable Sync page uses the spinning cloud-sync glyph for online-syncing.
    // A metadata pass is syncing too (#886).
    return { status: 'online_syncing', animated: true };
  }

  if (status === 'paused') {
    return { status: 'online_syncing', animated: false };
  }

  if (hasFailedUploads && isOnline) {
    return { status: 'online_failed', animated: false };
  }

  // Held recordings (removed from their project) never upload on their own, so
  // they must not resolve to a synced cloud even when pageStatus is
  // `allComplete` (#855). Reuse the pending glyph: unsent work on the device.
  if (hasHeldRecordings && !hasPendingUploads) {
    return {
      status: isOnline ? 'online_pending' : 'offline_pending',
      animated: false,
    };
  }

  switch (status) {
    case 'pending':
    case 'held':
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
  /** A metadata pass is in flight (#886). */
  isMetadataSyncing?: boolean;
  /** Recordings are held on the device because of a project removal (#855). */
  hasHeldRecordings?: boolean;
}

export function SyncStatusIndicator({
  status,
  isOnline = true,
  hasPendingUploads = false,
  hasFailedUploads = false,
  isUploading = false,
  isMetadataSyncing = false,
  hasHeldRecordings = false,
}: SyncStatusIndicatorProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { status: iconStatus, animated } = resolveIconState(
    status,
    isOnline,
    hasPendingUploads,
    hasFailedUploads,
    isUploading,
    isMetadataSyncing,
    hasHeldRecordings,
  );

  return (
    <View style={styles.circle}>
      <CloudSyncStatusIcon
        status={iconStatus}
        size={INDICATOR_SIZE * 0.5}
        animated={animated}
        cloudColor={theme.colors.mutedForeground}
        decorative
      />
    </View>
  );
}

const useStyles = () =>
  useThemedStyles(theme => ({
    circle: {
      width: INDICATOR_SIZE,
      height: INDICATOR_SIZE,
      borderRadius: INDICATOR_SIZE / 2,
      backgroundColor: theme.colors.cardBackground,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
  }));
