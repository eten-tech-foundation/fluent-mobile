import { usePreferences } from './usePreferences';
import { useConnectivity } from './useConnectivity';
import { useLocalSyncHealth } from './useLocalSyncHealth';
import { usePendingUploads } from './usePendingUploads';
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
    isUploading,
    uploadProgress,
  } = usePendingUploads(refreshKey);
  const { needsDownloadSync } = useLocalSyncHealth(refreshKey);

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
      hasPendingUploads,
      isUploading,
      hasFailedUploads,
      needsDownloadSync,
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
  };
}
