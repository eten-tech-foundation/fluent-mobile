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
  const { needsDownloadSync } = useLocalSyncHealth(refreshKey);
  const { reauthRequired } = useReauthRequired();
  const [hasMetadataSyncError, setHasMetadataSyncError] = useState(
    hasPersistedMetadataSyncErrors,
  );

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

  return {
    status: deriveSyncStatus({
      isOnline: effectivelyOnline,
      isSyncing,
      hasPendingUploads: hasPendingUploads || countsUnknown,
      isUploading,
      hasFailedUploads,
      needsDownloadSync,
      hasSyncRetryWork,
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
  };
}
