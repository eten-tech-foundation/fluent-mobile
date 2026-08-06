import { useCallback, useEffect, useState } from 'react';
import {
  getResourcesInventoryStatus,
  subscribeResourcesInventory,
} from '../services/resourcesInventory';
import { PrepareOfflineResourceStatus } from '../types/prepareOffline/types';

/**
 * Subscribe to Prepare Offline inventory for Resources gating (#192).
 * Does not fetch manifests or call Aquifer — status only.
 */
export function useResourcesInventory(projectId: number | null) {
  const [inventoryVersion, setInventoryVersion] = useState(0);

  useEffect(() => {
    return subscribeResourcesInventory(() => {
      setInventoryVersion(version => version + 1);
    });
  }, []);

  const getResourceStatus = useCallback(
    (resourceId: string): PrepareOfflineResourceStatus => {
      if (projectId === null) {
        return 'available';
      }
      return getResourcesInventoryStatus(projectId, resourceId);
    },
    // inventoryVersion forces callers to re-read after inventory pub/sub.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, inventoryVersion],
  );

  return {
    inventoryVersion,
    getResourceStatus,
  };
}
