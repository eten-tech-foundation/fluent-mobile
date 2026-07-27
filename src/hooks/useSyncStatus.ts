import { usePreferences } from './usePreferences';
import { useConnectivity } from './useConnectivity';
import { useLocalSyncHealth } from './useLocalSyncHealth';
import { usePendingUploads } from './usePendingUploads';
import { deriveSyncStatus } from '../utils/syncStatusState';

interface UseSyncStatusOptions {
  isSyncing: boolean;
  refreshKey?: number;
}

export function useSyncStatus({
  isSyncing,
  refreshKey = 0,
}: UseSyncStatusOptions) {
  const { isOnline, isWifi } = useConnectivity();
  const { uploadOverCellular } = usePreferences();
  const {
    pendingCount,
    failedCount,
    hasPendingUploads,
    hasFailedUploads,
    isUploading,
    uploadProgress,
  } = usePendingUploads(refreshKey);
  const { needsDownloadSync } = useLocalSyncHealth(refreshKey);

  // "Online" for sync chrome means allowed to sync: WiFi, or cellular when opted in.
  const effectivelyOnline = isOnline && (isWifi || uploadOverCellular);

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
    hasPendingUploads,
    hasFailedUploads,
    isUploading,
    uploadProgress,
    needsDownloadSync,
  };
}
