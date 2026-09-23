import { useCallback, useEffect, useState } from 'react';
import { getPrepareOfflineProjectContext } from '../db/queries.prepareOffline';
import {
  clearPrepareOfflineSessionInventory,
  fetchPrepareOfflineManifest,
  getDefaultPrepareOfflinePackageDeselects,
  getPrepareOfflineResourceStatus,
  refreshPrepareOfflineInventory,
  subscribePrepareOfflineInventory,
} from '../services/prepareOfflineResources';
import {
  PrepareOfflineChapterRow,
  PrepareOfflineResourceManifestItem,
} from '../types/prepareOffline/types';
import { buildManifestContexts } from '../utils/buildManifestContexts';

/**
 * Loads Prepare for Offline manifest + inventory via the resources service.
 * Manifest is wired to the real FluentAPI endpoint (#504); inventory reads
 * real download_queue status (#201).
 */
export function usePrepareOfflineResourceData(
  projectId: number | null,
  chapters: PrepareOfflineChapterRow[],
  selectedIds: Set<number>,
) {
  const [manifest, setManifest] = useState<
    PrepareOfflineResourceManifestItem[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [inventoryVersion, setInventoryVersion] = useState(0);

  useEffect(() => {
    if (projectId === null || selectedIds.size === 0) {
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
        const projectContext = await getPrepareOfflineProjectContext(
          projectId!,
        );
        if (!projectContext) {
          throw new Error(`No source language found for project ${projectId}`);
        }

        const contexts = buildManifestContexts(
          chapters,
          selectedIds,
          projectContext.sourceLanguageCode,
        );

        const responses = await Promise.all(
          contexts.map(ctx => fetchPrepareOfflineManifest(projectId!, ctx)),
        );

        if (!cancelled) {
          const byId = new Map<string, PrepareOfflineResourceManifestItem>();
          for (const items of responses) {
            for (const item of items) byId.set(item.id, item);
          }
          setManifest([...byId.values()]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    [...selectedIds].sort().join(','),
    chapters.map(ch => `${ch.id}:${ch.bibleId}`).join(','),
  ]);

  // Load real status from download_queue whenever the project changes, and
  // re-load whenever the subscription fires (queue mutated elsewhere).
  useEffect(() => {
    if (projectId === null) {
      return;
    }
    void refreshPrepareOfflineInventory(projectId);
  }, [projectId, inventoryVersion]);

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
    clearSessionInventory: () =>
      clearPrepareOfflineSessionInventory(projectId ?? undefined),
    getDefaultPackageDeselects: () =>
      getDefaultPrepareOfflinePackageDeselects(projectId),
  };
}
