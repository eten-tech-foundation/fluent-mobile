import { useCallback, useEffect, useState } from 'react';
import { getPrepareOfflineProjectContext } from '../db/queries.prepareOffline';
import {
  clearPrepareOfflineSessionInventory,
  fetchPrepareOfflineManifest,
  getDefaultPrepareOfflinePackageDeselects,
  getPrepareOfflineResourceStatus,
  subscribePrepareOfflineInventory,
} from '../services/prepareOfflineResources';
import {
  PrepareOfflineChapterRow,
  PrepareOfflineResourceManifestItem,
} from '../types/prepareOffline/types';
import { buildManifestContexts } from '../utils/buildManifestContexts';

/**
 * Loads Prepare for Offline manifest + inventory via the resources service.
 * Manifest is wired to the real FluentAPI endpoint (#504), fired once per
 * selected book/chapter-range chunk and merged; inventory stays mock-backed
 * until #201's real worker lands.
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
    // selectedIds is a Set — re-created each render in the caller, so its
    // *contents* must drive re-fetch, not reference identity. Using its
    // serialized form as a dep avoids re-fetching on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, chapters, [...selectedIds].sort().join(',')]);

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
    getDefaultPackageDeselects: () =>
      getDefaultPrepareOfflinePackageDeselects(projectId),
  };
}
