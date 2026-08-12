import { useCallback, useEffect, useState } from 'react';
import {
  getDownloadedResourceSections,
  getResourcesInventoryStatus,
  subscribeResourcesInventory,
} from '../services/resourcesInventory';
import { PrepareOfflineResourceStatus } from '../types/prepareOffline/types';
import { ResourceSectionId } from '../types/resources/types';

const NO_SECTIONS: ResourceSectionId[] = [];

/**
 * Subscribe to Prepare Offline inventory for Resources gating (#192).
 * Does not fetch manifests or call Aquifer — local status and persisted
 * `download_queue` completions only.
 */
export function useResourcesInventory(
  projectId: number | null,
  userId: number | null,
) {
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [downloadedSections, setDownloadedSections] =
    useState<ResourceSectionId[]>(NO_SECTIONS);

  useEffect(() => {
    return subscribeResourcesInventory(() => {
      setInventoryVersion(version => version + 1);
    });
  }, []);

  useEffect(() => {
    if (projectId === null || userId === null) {
      setDownloadedSections(NO_SECTIONS);
      return;
    }

    let active = true;
    void getDownloadedResourceSections(projectId, userId).then(sections => {
      if (active) {
        setDownloadedSections(sections);
      }
    });

    return () => {
      active = false;
    };
  }, [projectId, userId, inventoryVersion]);

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
    downloadedSections,
    getResourceStatus,
  };
}
