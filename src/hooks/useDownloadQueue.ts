import { useCallback, useEffect, useState } from 'react';
import type {
  DownloadQueueItem,
  DownloadQueueSnapshot,
} from '../types/download/types';
import { getDownloadQueueSnapshot } from '../db/repository';
import {
  DownloadQueueWorker,
  type ResourceResolver,
} from '../services/downloadQueueWorker';
import { logger } from '../utils/logger';
import {
  getActiveUserId,
  setPrepareOfflineDownloadStarted,
} from '../services/storage';

const log = logger.create('useDownloadQueue');

/** Flip to `true` locally to preview #147 UI on Sync screen. Do not merge enabled. */
const DEV_PREVIEW_DOWNLOAD_QUEUE = false;

export const EMPTY_DOWNLOAD_SNAPSHOT: DownloadQueueSnapshot = {
  items: [],
  completedCount: 0,
  totalCount: 0,
  aggregateProgress: 0,
};

/**
 * Dev-only preview scenarios for device QA on the Sync screen's Downloads
 * section. Grouped under one Record so switching the active scenario is a
 * one-line key change below, and every scenario stays a genuine property
 * read (avoids unused-variable lint warnings on the ones not currently
 * selected).
 */
const DEV_PREVIEW_SCENARIOS: Record<string, DownloadQueueSnapshot> = {
  // Scenario 1 — design mockup: 81% on first item, rest queued.
  scenario1: {
    items: [
      {
        id: '1',
        tier: 1,
        label: 'Source Bible',
        progress: 0.81,
        status: 'downloading',
        projectId: 1,
      },
      {
        id: '2',
        tier: 1,
        label: 'Source Bible',
        progress: 0,
        status: 'queued',
        projectId: 1,
      },
      {
        id: '3',
        tier: 2,
        label: 'Translation Notes — Mark',
        progress: 0,
        status: 'queued',
      },
      {
        id: '4',
        tier: 2,
        label: 'Translation Words — Luke',
        progress: 0,
        status: 'queued',
      },
    ],
    completedCount: 0,
    totalCount: 4,
    aggregateProgress: 0.2,
    primaryProjectId: 1,
  },

  // Scenario 2 — mixed progress: 67%, 33%, 12%, 0% (+ 1 completed).
  scenario2: {
    items: [
      {
        id: '1',
        tier: 1,
        label: 'Source Bible',
        progress: 1,
        status: 'completed',
        projectId: 1,
      },
      {
        id: '2',
        tier: 1,
        label: 'Source Bible',
        progress: 0.67,
        status: 'downloading',
        projectId: 1,
      },
      {
        id: '3',
        tier: 2,
        label: 'Translation Notes — Mark',
        progress: 0.33,
        status: 'downloading',
      },
      {
        id: '4',
        tier: 2,
        label: 'Translation Words — Luke',
        progress: 0.12,
        status: 'downloading',
      },
      {
        id: '5',
        tier: 2,
        label: 'Matthew — Audio',
        progress: 0,
        status: 'queued',
      },
    ],
    completedCount: 1,
    totalCount: 5,
    aggregateProgress: 0.55,
    primaryProjectId: 1,
  },

  // Scenario 3 — nearly complete: first three 100%, last 85%.
  scenario3: {
    items: [
      {
        id: '1',
        tier: 1,
        label: 'Source Bible',
        progress: 1,
        status: 'downloading',
        projectId: 1,
      },
      {
        id: '2',
        tier: 1,
        label: 'Source Bible',
        progress: 1,
        status: 'downloading',
        projectId: 1,
      },
      {
        id: '3',
        tier: 2,
        label: 'Translation Notes — Mark',
        progress: 1,
        status: 'downloading',
      },
      {
        id: '4',
        tier: 2,
        label: 'Translation Words — Luke',
        progress: 0.85,
        status: 'downloading',
      },
    ],
    completedCount: 0,
    totalCount: 4,
    aggregateProgress: 0.96,
    primaryProjectId: 1,
  },

  // Scenario 4 — single item: verifies "1 item remaining" copy.
  scenario4: {
    items: [
      {
        id: '1',
        tier: 1,
        label: 'Source Bible',
        progress: 0.42,
        status: 'downloading',
        projectId: 1,
      },
    ],
    completedCount: 0,
    totalCount: 1,
    aggregateProgress: 0.42,
    primaryProjectId: 1,
  },
};

/** Swap active scenario for device QA by changing the selected key. */
export const DEV_PREVIEW_DOWNLOAD_SNAPSHOT = DEV_PREVIEW_SCENARIOS.scenario4;

function hasActiveDownloads(snapshot: DownloadQueueSnapshot): boolean {
  return snapshot.items.some(item => item.status !== 'completed');
}

/**
 * TODO(#201 blocker): stub resolver. The real byte source (direct Aquifer
 * call, matching fluent-web's embedded-key pattern, vs. a new fluent-api
 * proxy endpoint) is still an open decision — see #51/#201 "Open questions".
 * Throws deliberately so a real download attempted before that's resolved
 * fails loudly instead of silently no-op'ing.
 */
const stubResolver: ResourceResolver = async item => {
  throw new Error(
    `No resource resolver configured yet (item ${item.id}). ` +
      'Download source (Aquifer vs fluent-api) is still an open decision — see #201.',
  );
};

// Single worker instance for the app's lifetime, mirroring other cross-screen
// service singletons (e.g. authToken) rather than recreating in-memory queue
// state per hook consumer.
const worker = new DownloadQueueWorker(stubResolver);

export function useDownloadQueue() {
  const [snapshot, setSnapshot] = useState<DownloadQueueSnapshot>(
    EMPTY_DOWNLOAD_SNAPSHOT,
  );

  const refresh = useCallback(async () => {
    if (__DEV__ && DEV_PREVIEW_DOWNLOAD_QUEUE) {
      setSnapshot(DEV_PREVIEW_DOWNLOAD_SNAPSHOT);
      return;
    }
    try {
      const next = await getDownloadQueueSnapshot();
      setSnapshot(next);
    } catch (error) {
      log.error('Failed to load download queue snapshot', { error });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while a download is actively in flight so progress isn't frozen
  // between action-triggered refreshes (start/pause/resume/cancel). Stops
  // automatically once nothing is `downloading`.
  useEffect(() => {
    const isActivelyDownloading = snapshot.items.some(
      item => item.status === 'downloading',
    );
    if (!isActivelyDownloading) {
      return;
    }

    const intervalId = setInterval(() => {
      void refresh();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [snapshot, refresh]);

  const start = useCallback(
    async (items: DownloadQueueItem[]) => {
      const userId = getActiveUserId();
      if (userId) {
        // #39: mark each affected project as download-started so its
        // re-surface prompt stops firing once a real download begins.
        const projectIds = new Set(
          items
            .map(item => item.projectId)
            .filter((id): id is number => id !== undefined),
        );
        for (const projectId of projectIds) {
          setPrepareOfflineDownloadStarted(userId, projectId);
        }
      }
      await worker.start(items);
      await refresh();
    },
    [refresh],
  );

  const pause = useCallback(async () => {
    await worker.pause();
    await refresh();
  }, [refresh]);

  const resume = useCallback(async () => {
    await worker.resume();
    await refresh();
  }, [refresh]);

  const cancel = useCallback(async () => {
    await worker.cancel();
    await refresh();
  }, [refresh]);

  const hasDownloads = hasActiveDownloads(snapshot);

  return { snapshot, hasDownloads, start, pause, resume, cancel, refresh };
}
