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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, inventoryVersion],
  );

  return {
    inventoryVersion,
    downloadedSections,
    getResourceStatus,
  };
}
