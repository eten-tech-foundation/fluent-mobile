import { useCallback, useEffect, useState } from 'react';
import {
  clearPrepareOfflineSessionInventory,
  fetchPrepareOfflineManifest,
  getDefaultPrepareOfflinePackageDeselects,
  getPrepareOfflineResourceStatus,
  subscribePrepareOfflineInventory,
} from '../services/prepareOfflineResources';
import { PrepareOfflineResourceManifestEntry } from '../types/prepareOffline/types';

/**
 * Loads Prepare for Offline manifest + inventory via the resources service.
 * Simulates network fetch today; #201 swaps the service implementation only.
 */
export function usePrepareOfflineResourceData(projectId: number | null) {
  const [manifest, setManifest] = useState<
    PrepareOfflineResourceManifestEntry[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [inventoryVersion, setInventoryVersion] = useState(0);

  useEffect(() => {
    if (projectId === null) {
      setManifest([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function loadManifest() {
      setLoading(true);
      setError(null);

      try {
        const entries = await fetchPrepareOfflineManifest(projectId!);
        if (!cancelled) {
          setManifest(entries);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
          setManifest([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadManifest();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    return subscribePrepareOfflineInventory(() => {
      setInventoryVersion(version => version + 1);
    });
  }, []);

  const getResourceStatus = useCallback(
    (resourceId: string) =>
      getPrepareOfflineResourceStatus(projectId ?? 0, resourceId),
    [projectId],
  );

  return {
    manifest,
    loading,
    error,
    inventoryVersion,
    getResourceStatus,
    clearSessionInventory: clearPrepareOfflineSessionInventory,
    getDefaultPackageDeselects: getDefaultPrepareOfflinePackageDeselects,
  };
}
