export type SyncStatus =
  | 'online_synced'
  | 'online_syncing'
  | 'online_pending'
  | 'offline_synced'
  | 'offline_pending';

export interface SyncStatusInputs {
  isOnline: boolean;
  isSyncing: boolean;
  hasPendingUploads: boolean;
}

export function deriveSyncStatus({
  isOnline,
  isSyncing,
  hasPendingUploads,
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

  return 'online_synced';
}

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  online_synced: 'Synced. Open Sync page.',
  online_syncing: 'Syncing. Open Sync page.',
  online_pending: 'Pending upload. Open Sync page.',
  offline_synced: 'Offline. Open Sync page.',
  offline_pending: 'Offline with pending upload. Open Sync page.',
};
