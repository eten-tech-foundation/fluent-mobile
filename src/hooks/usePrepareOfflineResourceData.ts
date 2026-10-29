import { useCallback, useEffect, useState } from 'react';
import { getPrepareOfflineProjectContext } from '../db/queries.prepareOffline';
import { AuthError } from '../services/authError';
import {
  clearPrepareOfflineSessionInventory,
  fetchPrepareOfflineManifestsBounded,
  getDefaultPrepareOfflinePackageDeselects,
  getPrepareOfflineResourceStatus,
  refreshPrepareOfflineInventory,
  subscribePrepareOfflineInventory,
} from '../services/prepareOfflineResources';
import { refreshPrepareOfflineReferencedParents } from '../services/sync';
import { ApiError } from '../types/api/errors';
import {
  PrepareOfflineChapterRow,
  PrepareOfflineResourceManifestItem,
} from '../types/prepareOffline/types';
import {
  buildManifestContexts,
  PrepareOfflineManifestContext,
} from '../utils/buildManifestContexts';
import { logger } from '../utils/logger';

const log = logger.create('usePrepareOfflineResourceData');

/** Cap successful-repair cache so long sessions cannot grow unbounded. */
const MAX_ENSURED_REFERENCED_PARENTS_KEYS = 64;

/**
 * One successful repair per user+project+referenced bible/book set.
 * FIFO Map: insertion order; oldest key evicted when over capacity.
 */
const ensuredReferencedParentsKeys = new Map<string, true>();

/** @internal test helper — clears the PFO referenced-parent ensure latch. */
export function __resetPrepareOfflineReferencedParentsLatchForTests(): void {
  ensuredReferencedParentsKeys.clear();
}

function rememberSuccessfulReferencedParentsRepair(key: string): void {
  if (ensuredReferencedParentsKeys.has(key)) {
    return;
  }
  if (
    ensuredReferencedParentsKeys.size >= MAX_ENSURED_REFERENCED_PARENTS_KEYS
  ) {
    const oldest = ensuredReferencedParentsKeys.keys().next().value;
    if (oldest !== undefined) {
      ensuredReferencedParentsKeys.delete(oldest);
    }
  }
  ensuredReferencedParentsKeys.set(key, true);
}

function referencedParentsLatchKey(
  userId: number,
  projectId: number,
  refs: Array<{ bibleId: number; bookId: number }>,
): string | null {
  const bibleIds = [
    ...new Set(
      refs
        .map(ref => ref.bibleId)
        .filter(id => typeof id === 'number' && Number.isInteger(id) && id > 0),
    ),
  ].sort((a, b) => a - b);
  const bookIds = [
    ...new Set(
      refs
        .map(ref => ref.bookId)
        .filter(id => typeof id === 'number' && Number.isInteger(id) && id > 0),
    ),
  ].sort((a, b) => a - b);
  if (bibleIds.length === 0 && bookIds.length === 0) {
    return null;
  }
  return `${userId}:${projectId}:b=${bibleIds.join(',')}:k=${bookIds.join(
    ',',
  )}`;
}

function manifestFailureExceptionName(err: unknown): string {
  if (err instanceof AuthError) return 'AuthError';
  if (err instanceof ApiError) return 'ApiError';
  if (err instanceof TypeError) return 'TypeError';
  if (err instanceof Error) return 'Error';
  return 'Unknown';
}

// Never forward the error, its name/code, or arbitrary string fields.
function logManifestFailureDiagnostic(
  err: unknown,
  failureStage: string,
  projectId: number,
  selectedChapterCount: number,
): void {
  if (!(globalThis as { __DEV__?: boolean }).__DEV__) return;
  const apiStatus =
    err instanceof ApiError &&
    Number.isInteger(err.status) &&
    (err.status === 0 || (err.status >= 100 && err.status <= 599))
      ? err.status
      : undefined;
  const truncated =
    err instanceof Error &&
    err.message ===
      `[prepareOfflineResources] manifest truncated for project ${projectId}`;
  log.warn('Prepare Offline manifest load failed', {
    timestamp: new Date().toISOString(),
    event: 'prepare_offline_manifest_failure',
    projectId,
    selectedChapterCount,
    exceptionName: manifestFailureExceptionName(err),
    classification: truncated ? 'truncated_manifest' : failureStage,
    ...(apiStatus !== undefined ? { apiStatus } : {}),
  });
}

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
    const selectionController = new AbortController();

    async function loadManifest() {
      setLoading(true);
      setError(null);
      let failureStage = 'local_context';

      try {
        // Narrow referenced-parent repair only (no claims / full metadata
        // refresh). Latch solely on successful upsert for this ref-id set.
        const selectedRefs = chapters
          .filter(ch => selectedIds.has(ch.id))
          .map(ch => ({ bibleId: ch.bibleId, bookId: ch.bookId }));
        if (userId !== null) {
          const ensureKey = referencedParentsLatchKey(
            userId,
            projectId!,
            selectedRefs,
          );
          if (ensureKey && !ensuredReferencedParentsKeys.has(ensureKey)) {
            const repair = await refreshPrepareOfflineReferencedParents({
              userId,
              projectId: projectId!,
              chapters: selectedRefs,
            });
            if (cancelled) {
              return;
            }
            if (repair === 'ok') {
              rememberSuccessfulReferencedParentsRepair(ensureKey);
            }
          }
        }

        if (cancelled) {
          return;
        }

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
        // Bounded concurrency + selection abort (no Promise.all fan-out).
        const items = await fetchPrepareOfflineManifestsBounded(
          projectId!,
          contexts,
          selectionController.signal,
        );

        if (!cancelled) {
          setManifestContexts(contexts);
          const byId = new Map<string, PrepareOfflineResourceManifestItem>();
          for (const item of items) byId.set(item.id, item);
          setManifest([...byId.values()]);
        }
      } catch (err) {
        if (
          cancelled ||
          selectionController.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        logManifestFailureDiagnostic(
          err,
          failureStage,
          projectId!,
          selectedIds.size,
        );
        setError(err);
        setManifest([]);
        setManifestContexts([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadManifest();

    return () => {
      cancelled = true;
      selectionController.abort();
    };
    // userId included: account switch must re-run repair + catalog load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId, selectedKey, chaptersKey]);

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
