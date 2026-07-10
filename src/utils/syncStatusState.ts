export type SyncStatus =
  | 'online_synced'
  | 'online_syncing'
  | 'online_needs_sync'
  | 'online_pending'
  | 'offline_synced'
  | 'offline_pending';

export interface SyncStatusInputs {
  isOnline: boolean;
  isSyncing: boolean;
  hasPendingUploads: boolean;
  /** Local SQLite is missing server assignment data (download sync needed). */
  needsDownloadSync?: boolean;
}

export function deriveSyncStatus({
  isOnline,
  isSyncing,
  hasPendingUploads,
  needsDownloadSync = false,
}: SyncStatusInputs): SyncStatus {
  if (!isOnline) {
    return hasPendingUploads ? 'offline_pending' : 'offline_synced';
  }

  if (isSyncing) {
    return 'online_syncing';
  }

  if (hasPendingUploads) {
    return 'online_pending';
  }

  if (needsDownloadSync) {
    return 'online_needs_sync';
  }

  return 'online_synced';
}

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  online_synced: 'Synced. Open Sync page.',
  online_syncing: 'Syncing. Open Sync page.',
  online_needs_sync: 'Updates available. Tap to sync.',
  online_pending: 'Pending upload. Open Sync page.',
  offline_synced: 'Offline. Open Sync page.',
  offline_pending: 'Offline with pending upload. Open Sync page.',
};
