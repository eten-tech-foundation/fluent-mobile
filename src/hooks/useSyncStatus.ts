import { useEffect, useState } from 'react';
import { usePreferences } from './usePreferences';
import { useConnectivity } from './useConnectivity';
import { useLocalSyncHealth } from './useLocalSyncHealth';
import { usePendingUploads } from './usePendingUploads';
import { useReauthRequired } from './useReauthRequired';
import { onSyncComplete } from '../services/syncEvents';
import { hasPersistedMetadataSyncErrors } from '../utils/metadataSyncErrors';
import { deriveSyncStatus } from '../utils/syncStatusState';
import { isEffectivelyOnlineForTransfer } from '../utils/transportPolicy';

interface UseSyncStatusOptions {
  isSyncing: boolean;
  refreshKey?: number;
}

export function useSyncStatus({
  isSyncing,
  refreshKey = 0,
}: UseSyncStatusOptions) {
  const {
    isOnline,
    isLinkOnline,
    isWifi,
    connectionType,
    hasResolved,
    hasTransferResolved,
  } = useConnectivity();
  const { uploadOverCellular } = usePreferences();
  const {
    pendingCount,
    failedCount,
    failedErrorText,
    hasPendingUploads,
    hasFailedUploads,
    countsUnknown,
    isUploading,
    uploadProgress,
  } = usePendingUploads(refreshKey);
  const { needsDownloadSync, missingTextChapters } =
    useLocalSyncHealth(refreshKey);
  const { reauthRequired } = useReauthRequired();
  // Effect below is the single reader for persisted metadata errors (mount +
  // refreshKey). Avoid lazy useState init so we do not double-read on mount.
  const [hasMetadataSyncError, setHasMetadataSyncError] = useState(false);

  useEffect(() => {
    setHasMetadataSyncError(hasPersistedMetadataSyncErrors());
  }, [refreshKey]);

  useEffect(() => {
    return onSyncComplete(() => {
      setHasMetadataSyncError(hasPersistedMetadataSyncErrors());
    });
  }, []);

  // Metadata sync_error_* / active-user reauth only — do not fold into
  // needsDownloadSync (Home auto-repair stays assignee-repair-only).
  const hasSyncRetryWork = hasMetadataSyncError || reauthRequired;
  // Same reason: fetchable text keeps Sync offered without auto-triggering it.
  const needsTextSync = missingTextChapters > 0;

  const effectivelyOnline =
    hasResolved &&
    hasTransferResolved &&
    isOnline &&
    isEffectivelyOnlineForTransfer({
      isOnline: isLinkOnline,
      isWifi,
      uploadOverCellular,
      connectionType,
    });

  // Unknown until both answers are in, unless /health already confirms
  // offline. A down link reaches us as that answer; the transport snapshot
  // alone can't tell down from not-yet-known.
  const connectivityPending =
    !hasResolved || (isOnline && !hasTransferResolved);

  return {
    status: deriveSyncStatus({
      isOnline: effectivelyOnline,
      connectivityPending,
      isSyncing,
      hasPendingUploads: hasPendingUploads || countsUnknown,
      isUploading,
      hasFailedUploads,
      needsDownloadSync,
      hasSyncRetryWork,
      needsTextSync,
    }),
    isOnline: effectivelyOnline,
    pendingCount,
    failedCount,
    failedErrorText,
    hasPendingUploads,
    hasFailedUploads,
    isUploading,
    uploadProgress,
    needsDownloadSync,
    hasSyncRetryWork,
    needsTextSync,
    missingTextChapters,
  };
}
