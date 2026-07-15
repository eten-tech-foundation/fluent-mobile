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
  const { isOnline } = useConnectivity();
  const { pendingCount, hasPendingUploads } = usePendingUploads(refreshKey);
  const { needsDownloadSync } = useLocalSyncHealth(refreshKey);

  return {
    status: deriveSyncStatus({
      isOnline,
      isSyncing,
      hasPendingUploads,
      needsDownloadSync,
    }),
    isOnline,
    pendingCount,
    hasPendingUploads,
    needsDownloadSync,
  };
}
