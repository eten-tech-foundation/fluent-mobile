import { useConnectivity } from './useConnectivity';
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

  return {
    status: deriveSyncStatus({ isOnline, isSyncing, hasPendingUploads }),
    isOnline,
    pendingCount,
    hasPendingUploads,
  };
}
