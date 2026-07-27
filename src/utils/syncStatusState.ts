export type SyncStatus =
  | 'online_synced'
  | 'online_syncing'
  | 'online_uploading'
  | 'online_failed'
  | 'online_needs_sync'
  | 'online_pending'
  | 'offline_synced'
  | 'offline_pending';

export interface SyncStatusInputs {
  isOnline: boolean;
  isSyncing: boolean;
  hasPendingUploads: boolean;
  /** Recording upload worker is actively transferring. */
  isUploading?: boolean;
  /** At least one latest recording has sync_status = failed. */
  hasFailedUploads?: boolean;
  /** Local SQLite is missing server assignment data (download sync needed). */
  needsDownloadSync?: boolean;
}

export function deriveSyncStatus({
  isOnline,
  isSyncing,
  hasPendingUploads,
  isUploading = false,
  hasFailedUploads = false,
  needsDownloadSync = false,
}: SyncStatusInputs): SyncStatus {
  if (!isOnline) {
    return hasPendingUploads || hasFailedUploads
      ? 'offline_pending'
      : 'offline_synced';
  }

  if (isSyncing) {
    return 'online_syncing';
  }

  if (isUploading) {
    return 'online_uploading';
  }

  if (hasFailedUploads) {
    return 'online_failed';
  }

  if (hasPendingUploads) {
    return 'online_pending';
  }

  if (needsDownloadSync) {
    return 'online_needs_sync';
  }

  return 'online_synced';
}

/**
 * Header cloud a11y labels — aligned with Lovable Sync chrome
 * (`title. Open Sync page.` from fluent-test1.lovable.app).
 */
export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  online_synced: 'Online · all synced. Open Sync page.',
  online_syncing: 'Syncing…. Open Sync page.',
  // Uploading uses the same Syncing… chrome as Lovable's online-syncing state.
  online_uploading: 'Syncing…. Open Sync page.',
  online_failed: 'Upload failed. Open Sync page to retry.',
  online_needs_sync: 'Updates available. Tap to sync.',
  online_pending: 'Online · upload pending. Open Sync page.',
  offline_synced: 'Offline · nothing pending. Open Sync page.',
  offline_pending: 'Offline · upload pending. Open Sync page.',
};

/** Accessibility / status-line label with optional upload progress counts. */
export function formatSyncStatusLabel(
  status: SyncStatus,
  options?: {
    completed?: number;
    total?: number;
    failedCount?: number;
  },
): string {
  if (
    status === 'online_uploading' &&
    options?.total != null &&
    options.total > 0
  ) {
    const completed = options.completed ?? 0;
    return `Uploading ${completed} of ${options.total}. Open Sync page.`;
  }

  if (
    status === 'online_failed' &&
    options?.failedCount != null &&
    options.failedCount > 0
  ) {
    const n = options.failedCount;
    return `${n} upload${n === 1 ? '' : 's'} failed. Open Sync page to retry.`;
  }

  return SYNC_STATUS_LABELS[status];
}
