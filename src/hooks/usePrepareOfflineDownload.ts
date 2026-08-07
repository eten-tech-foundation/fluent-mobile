import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getDownloadedResourcesByProject,
  getResumableDownloadItems,
  cancelProjectDownloadTransfers,
} from '../db/repository';
import { useDownloadQueue } from './useDownloadQueue';
import { enqueuePrepareOfflineDownload } from '../services/prepareOfflineDownload';
import {
  getPrepareOfflineDownloadStarted,
  setPrepareOfflineDownloadStarted,
} from '../services/storage';
import {
  PrepareOfflineCatalog,
  PrepareOfflineResourceItem,
} from '../types/prepareOffline/types';
import type { DownloadQueueItem } from '../types/download/types';
import type { WorkerSessionState } from '../services/downloadQueueWorker';
import { mergeQueueIntoPrepareOfflineCatalog } from '../utils/mergeQueueIntoPrepareOfflineCatalog';
import {
  computeRemainingBytes,
  sortItemsForPrepareOfflineDownload,
} from '../utils/prepareOfflineCatalog';
import { formatByteSize } from '../utils/formatByteSize';
import { logger } from '../utils/logger';

const log = logger.create('usePrepareOfflineDownload');

export type PrepareOfflineDownloadSession =
  | 'idle'
  | 'downloading'
  | 'paused'
  | 'complete';

export interface UsePrepareOfflineDownloadInput {
  projectId: number | null;
  userId: number | null;
  catalog: PrepareOfflineCatalog;
  selectedItems: PrepareOfflineResourceItem[];
  canDownload: boolean;
}

function deriveSession(
  workerState: WorkerSessionState,
  projectId: number | null,
  queueItems: { projectId?: number; status: string }[],
  sessionStarted: boolean,
  selectedComplete: boolean,
  forceIdle: boolean,
): PrepareOfflineDownloadSession {
  if (forceIdle) {
    return 'idle';
  }

  if (projectId === null) {
    return 'idle';
  }

  const projectItems = queueItems.filter(item => item.projectId === projectId);

  if (sessionStarted && selectedComplete) {
    return 'complete';
  }

  if (workerState === 'paused') {
    return 'paused';
  }

  if (projectItems.some(item => item.status === 'paused')) {
    return 'paused';
  }

  if (
    workerState === 'downloading' ||
    projectItems.some(item => item.status === 'downloading')
  ) {
    return 'downloading';
  }

  return 'idle';
}

export function usePrepareOfflineDownload({
  projectId,
  userId,
  catalog,
  selectedItems,
  canDownload,
}: UsePrepareOfflineDownloadInput) {
  const {
    snapshot,
    start,
    pause,
    resume,
    cancel,
    refresh,
    workerSessionState,
  } = useDownloadQueue();

  const [busy, setBusy] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [forceIdle, setForceIdle] = useState(false);
  const [completedQueueItems, setCompletedQueueItems] = useState<
    DownloadQueueItem[]
  >([]);
  const sessionKeyRef = useRef<string | null>(null);
  const userCancelledRef = useRef(false);

  const sessionKey =
    projectId !== null ? `${projectId}:${userId ?? 'none'}` : null;

  useEffect(() => {
    if (sessionKeyRef.current !== sessionKey) {
      setSessionStarted(false);
      setForceIdle(false);
      userCancelledRef.current = false;
      sessionKeyRef.current = sessionKey;
    }
  }, [sessionKey]);

  useEffect(() => {
    if (projectId === null) {
      setCompletedQueueItems([]);
      return;
    }

    void getDownloadedResourcesByProject(projectId).then(
      setCompletedQueueItems,
    );
  }, [projectId, snapshot]);

  const allQueueItems = useMemo(
    () => [...snapshot.items, ...completedQueueItems],
    [snapshot.items, completedQueueItems],
  );

  const catalogWithProgress = useMemo(
    () =>
      mergeQueueIntoPrepareOfflineCatalog(catalog, allQueueItems, projectId),
    [catalog, allQueueItems, projectId],
  );

  const mergedSelectedItems = useMemo(
    () =>
      selectedItems.map(item => {
        const merged = catalogWithProgress.items.find(
          entry => entry.id === item.id,
        );
        return merged ?? item;
      }),
    [catalogWithProgress.items, selectedItems],
  );

  const selectedComplete = useMemo(
    () =>
      mergedSelectedItems.length > 0 &&
      mergedSelectedItems.every(item => item.status === 'completed'),
    [mergedSelectedItems],
  );

  useEffect(() => {
    if (projectId === null || userId === null) {
      return;
    }

    const projectItems = snapshot.items.filter(
      item => item.projectId === projectId,
    );

    const hasLiveTransfer = projectItems.some(
      item => item.status === 'downloading' || item.status === 'paused',
    );

    if (hasLiveTransfer) {
      setSessionStarted(true);
      if (!userCancelledRef.current) {
        setForceIdle(false);
      }
      return;
    }

    if (
      selectedComplete &&
      getPrepareOfflineDownloadStarted(String(userId), projectId)
    ) {
      setSessionStarted(true);
    }
  }, [projectId, userId, snapshot.items, selectedComplete]);

  const session = useMemo(
    () =>
      deriveSession(
        workerSessionState,
        projectId,
        snapshot.items,
        sessionStarted,
        selectedComplete,
        forceIdle,
      ),
    [
      workerSessionState,
      projectId,
      snapshot.items,
      sessionStarted,
      selectedComplete,
      forceIdle,
    ],
  );

  const pendingBytes = useMemo(
    () => computeRemainingBytes(mergedSelectedItems),
    [mergedSelectedItems],
  );

  const downloadButtonLabel = useMemo(() => {
    if (pendingBytes > 0) {
      return `Download ${formatByteSize(pendingBytes)}`;
    }

    const totalSelectedBytes = mergedSelectedItems.reduce(
      (sum, item) => sum + item.bytes,
      0,
    );

    return totalSelectedBytes > 0
      ? 'All on device'
      : `Download ${formatByteSize(0)}`;
  }, [mergedSelectedItems, pendingBytes]);

  const hasResumableQueueWork = useMemo(
    () =>
      projectId !== null &&
      snapshot.items.some(
        item =>
          item.projectId === projectId &&
          ['queued', 'cancelled', 'failed', 'paused'].includes(item.status),
      ),
    [projectId, snapshot.items],
  );

  const canDownloadNow =
    (canDownload && pendingBytes > 0) || hasResumableQueueWork;

  const handleDownload = useCallback(async () => {
    if (projectId === null || userId === null) {
      return;
    }

    if (busy) {
      return;
    }

    const resumable = await getResumableDownloadItems(true);
    const existingProjectItems = resumable.filter(
      item => item.projectId === projectId,
    );

    if (!canDownloadNow && existingProjectItems.length === 0) {
      return;
    }

    setForceIdle(false);
    userCancelledRef.current = false;
    setSessionStarted(true);
    setPrepareOfflineDownloadStarted(String(userId), projectId);

    setBusy(true);
    try {
      if (canDownload) {
        await enqueuePrepareOfflineDownload({
          userId,
          projectId,
          items: sortItemsForPrepareOfflineDownload(
            selectedItems,
            catalog.items,
          ),
        });
      }

      await refresh();

      const projectItems = (await getResumableDownloadItems(true)).filter(
        item => item.projectId === projectId,
      );

      if (projectItems.length > 0) {
        await start(projectItems);
      }
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    canDownload,
    canDownloadNow,
    catalog.items,
    projectId,
    refresh,
    selectedItems,
    start,
    userId,
  ]);

  const handlePause = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      log.info('Prepare offline download paused', { projectId });
      await pause();
    } finally {
      setBusy(false);
    }
  }, [busy, pause, projectId]);

  const handleResume = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      log.info('Prepare offline download resumed', { projectId });
      setForceIdle(false);
      await resume();
    } finally {
      setBusy(false);
    }
  }, [busy, projectId, resume]);

  const handleCancel = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      log.info('Prepare offline download cancelled', { projectId });
      await cancel();
      if (projectId !== null) {
        await cancelProjectDownloadTransfers(projectId);
      }
      await refresh();
      userCancelledRef.current = true;
      setForceIdle(true);
    } finally {
      setBusy(false);
    }
  }, [busy, cancel, projectId, refresh]);

  return {
    session,
    busy,
    catalogWithProgress,
    downloadButtonLabel,
    canDownload: canDownloadNow,
    handleDownload,
    pause: handlePause,
    resume: handleResume,
    cancel: handleCancel,
  };
}
