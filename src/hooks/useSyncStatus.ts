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
  const { pendingCount, hasPendingUploads } = usePendingUploads(refreshKey);
  const { needsDownloadSync } = useLocalSyncHealth(refreshKey);

  const effectivelyOnline = isOnline && (isWifi || uploadOverCellular);

  return {
    status: deriveSyncStatus({
      isOnline: effectivelyOnline,
      isSyncing,
      hasPendingUploads,
      needsDownloadSync,
    }),
    isOnline: effectivelyOnline,
    pendingCount,
    hasPendingUploads,
    needsDownloadSync,
  };
}
