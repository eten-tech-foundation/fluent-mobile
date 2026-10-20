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
import {
  buildManifestContexts,
  PrepareOfflineManifestContext,
} from '../utils/buildManifestContexts';
import { logger } from '../utils/logger';
import { ApiError } from '../types/api/errors';
import { AuthError } from '../services/authError';

const log = logger.create('usePrepareOfflineResourceData');

/**
 * Loads Prepare for Offline manifest + inventory via the resources service.
 * Manifest is wired to the real FluentAPI endpoint (#504); inventory reads
 * real download_queue status (#201), scoped to the signed-in user so
 * multiple accounts on one device don't see each other's queue state.
 */
export function usePrepareOfflineResourceData(
  projectId: number | null,
  userId: number | null,
  chapters: PrepareOfflineChapterRow[],
  selectedIds: Set<number>,
) {
  const [manifest, setManifest] = useState<
    PrepareOfflineResourceManifestItem[]
  >([]);
  const [manifestContexts, setManifestContexts] = useState<
    PrepareOfflineManifestContext[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const selectedKey = [...selectedIds].sort((a, b) => a - b).join(',');
  const chaptersKey = chapters
    .map(
      ch =>
        `${ch.id}:${ch.bibleId}:${ch.bookCode}:${ch.bookId}:${ch.chapterNumber}`,
    )
    .join(',');

  useEffect(() => {
    if (projectId === null || selectedIds.size === 0) {
      setManifest([]);
      setManifestContexts([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function loadManifest() {
      setLoading(true);
      setError(null);
      let failureStage = 'local_context';

      try {
        const projectContext = await getPrepareOfflineProjectContext(
          projectId!,
        );
        if (!projectContext) {
          throw new Error(`No source language found for project ${projectId}`);
        }

        failureStage = 'chapter_context';
        const contexts = buildManifestContexts(
          chapters,
          selectedIds,
          projectContext.sourceLanguageCode,
        );

        failureStage = 'manifest';
        const responses = await Promise.all(
          contexts.map(ctx => fetchPrepareOfflineManifest(projectId!, ctx)),
        );

        if (!cancelled) {
          setManifestContexts(contexts);
          const byId = new Map<string, PrepareOfflineResourceManifestItem>();
          for (const items of responses) {
            for (const item of items) byId.set(item.id, item);
          }
          setManifest([...byId.values()]);
        }
      } catch (err) {
        if (!cancelled) {
          if ((globalThis as { __DEV__?: boolean }).__DEV__) {
            const exceptionName =
              err instanceof AuthError
                ? 'AuthError'
                : err instanceof ApiError
                ? 'ApiError'
                : err instanceof TypeError
                ? 'TypeError'
                : err instanceof Error
                ? 'Error'
                : 'Unknown';
            const apiStatus =
              err instanceof ApiError &&
              Number.isInteger(err.status) &&
              (err.status === 0 || (err.status >= 100 && err.status <= 599))
                ? err.status
                : undefined;
            // Never forward the error, its name/code, or arbitrary string fields.
            log.warn('Prepare Offline manifest load failed', {
              timestamp: new Date().toISOString(),
              event: 'prepare_offline_manifest_failure',
              projectId,
              selectedChapterCount: selectedIds.size,
              exceptionName,
              classification:
                err instanceof Error &&
                err.message ===
                  `[prepareOfflineResources] manifest truncated for project ${projectId}`
                  ? 'truncated_manifest'
                  : failureStage,
              ...(apiStatus !== undefined ? { apiStatus } : {}),
            });
          }
          setError(err);
          setManifest([]);
          setManifestContexts([]);
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
  }, [projectId, selectedKey, chaptersKey]);

  // Load real status from download_queue whenever the project or user
  // changes, and re-load whenever the subscription fires (queue mutated
  // elsewhere).
  useEffect(() => {
    if (projectId === null || userId === null) {
      return;
    }
    refreshPrepareOfflineInventory(projectId, userId).catch(error => {
      log.warn('Inventory refresh failed', { error, projectId, userId });
    });
  }, [projectId, userId, inventoryVersion]);

  useEffect(() => {
    return subscribePrepareOfflineInventory(() => {
      setInventoryVersion(version => version + 1);
    });
  }, []);

  const getResourceStatus = useCallback(
    (resourceId: string) =>
      getPrepareOfflineResourceStatus(projectId ?? 0, userId ?? 0, resourceId),
    [projectId, userId],
  );

  return {
    manifest,
    manifestContexts,
    loading,
    error,
    inventoryVersion,
    getResourceStatus,
    clearSessionInventory: () =>
      clearPrepareOfflineSessionInventory(
        projectId ?? undefined,
        userId ?? undefined,
      ),
    getDefaultPackageDeselects: () =>
      getDefaultPrepareOfflinePackageDeselects(projectId),
  };
}
