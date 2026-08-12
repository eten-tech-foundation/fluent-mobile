import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrepareOfflineResourceData } from './usePrepareOfflineResourceData';
import { PrepareOfflineChapterRow } from '../types/prepareOffline/types';
import {
  buildPrepareOfflineCatalog,
  buildEffectiveCatalog,
  computePendingBytes,
  computeTotalBytes,
  getEffectiveItems,
  isItemCustomizeLocked,
} from '../utils/prepareOfflineCatalog';

export interface UsePrepareOfflineResourcesInput {
  projectId: number | null;
  userId: number | null;
  chapters: PrepareOfflineChapterRow[];
  selectedIds: Set<number>;
  selectedCount: number;
  isAssignedUser: boolean;
}

export function usePrepareOfflineResources({
  projectId,
  userId,
  chapters,
  selectedIds,
  selectedCount,
  isAssignedUser,
}: UsePrepareOfflineResourcesInput) {
  const [deselectedItemIds, setDeselectedItemIds] = useState<Set<string>>(
    new Set(),
  );
  const sessionKeyRef = useRef<string | null>(null);

  const {
    manifest,
    loading: manifestLoading,
    error: manifestError,
    inventoryVersion,
    getResourceStatus,
    getDefaultPackageDeselects,
  } = usePrepareOfflineResourceData(projectId);

  const sessionKey =
    projectId !== null ? `${projectId}:${userId ?? 'none'}` : null;

  // Reset package UI state when project/user changes or the screen remounts.
  // Do not clear mock/on-device inventory here — remounting Prepare Offline was
  // wiping completed downloads and leaving Resources empty (#305 QA).
  useEffect(() => {
    if (sessionKeyRef.current !== sessionKey) {
      setDeselectedItemIds(getDefaultPackageDeselects());
      sessionKeyRef.current = sessionKey;
    }
  }, [sessionKey, getDefaultPackageDeselects]);

  const catalog = useMemo(() => {
    void inventoryVersion;
    if (projectId === null) {
      return { items: [], groups: [] };
    }
    return buildPrepareOfflineCatalog({
      projectId,
      manifest,
      getResourceStatus,
      chapters,
      selectedIds,
    });
  }, [
    projectId,
    manifest,
    getResourceStatus,
    chapters,
    selectedIds,
    inventoryVersion,
  ]);

  const effectiveCatalog = useMemo(
    () => buildEffectiveCatalog(catalog, deselectedItemIds),
    [catalog, deselectedItemIds],
  );

  const totalBytes = useMemo(
    () => computeTotalBytes(catalog, deselectedItemIds),
    [catalog, deselectedItemIds],
  );

  const pendingBytes = useMemo(
    () => computePendingBytes(catalog, deselectedItemIds),
    [catalog, deselectedItemIds],
  );

  const selectedItems = useMemo(
    () => getEffectiveItems(catalog, deselectedItemIds),
    [catalog, deselectedItemIds],
  );

  const canDownload = useMemo(() => {
    if (catalog.items.length === 0) {
      return false;
    }

    if (!isAssignedUser && selectedCount < 1) {
      return false;
    }

    return pendingBytes > 0;
  }, [catalog.items.length, isAssignedUser, pendingBytes, selectedCount]);

  const isItemSelected = useCallback(
    (itemId: string) => !deselectedItemIds.has(itemId),
    [deselectedItemIds],
  );

  const toggleItemSelected = useCallback(
    (itemId: string) => {
      const item = catalog.items.find(entry => entry.id === itemId);
      if (!item || isItemCustomizeLocked(item)) {
        return;
      }

      setDeselectedItemIds(prev => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
    },
    [catalog.items],
  );

  return {
    catalog,
    effectiveCatalog,
    deselectedItemIds,
    totalBytes,
    pendingBytes,
    selectedItems,
    canDownload,
    manifestLoading,
    manifestError,
    isItemSelected,
    toggleItemSelected,
  };
}
