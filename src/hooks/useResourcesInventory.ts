import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDownloadedResourceSections,
  getResourcesInventoryStatus,
  subscribeResourcesInventory,
} from '../services/resourcesInventory';
import { PrepareOfflineResourceStatus } from '../types/prepareOffline/types';
import { ResourceSectionId } from '../types/resources/types';

const NO_SECTIONS: ResourceSectionId[] = [];

function inventoryIdentityKey(
  projectId: number | null,
  userId: number | null,
): string | null {
  if (projectId === null || userId === null) {
    return null;
  }
  return `${projectId}:${userId}`;
}

/**
 * Subscribe to Prepare Offline inventory for Resources gating (#192).
 * Does not fetch manifests or call Aquifer — local status and persisted
 * `download_queue` completions only.
 *
 * Section availability is bound to the active project + account. On identity
 * change, previously loaded sections are cleared until the matching lookup
 * resolves so a same-device account switch cannot leak the prior user's gates.
 */
export function useResourcesInventory(
  projectId: number | null,
  userId: number | null,
) {
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [downloadedSections, setDownloadedSections] =
    useState<ResourceSectionId[]>(NO_SECTIONS);
  const identityKeyRef = useRef<string | null>(
    inventoryIdentityKey(projectId, userId),
  );

  useEffect(() => {
    return subscribeResourcesInventory(() => {
      setInventoryVersion(version => version + 1);
    });
  }, []);

  useEffect(() => {
    const nextKey = inventoryIdentityKey(projectId, userId);

    if (nextKey === null) {
      identityKeyRef.current = null;
      setDownloadedSections(NO_SECTIONS);
      return;
    }

    // Drop prior identity's sections immediately; do not wait for the new
    // download_queue lookup (avoids cross-account / cross-project bleed).
    if (identityKeyRef.current !== nextKey) {
      identityKeyRef.current = nextKey;
      setDownloadedSections(NO_SECTIONS);
    }

    let active = true;
    void getDownloadedResourceSections(projectId!, userId!).then(sections => {
      if (active && identityKeyRef.current === nextKey) {
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
