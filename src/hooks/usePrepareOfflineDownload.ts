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

type PendingSessionAction = 'pause' | 'resume' | 'cancel';

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

  const projectHasPaused = projectItems.some(item => item.status === 'paused');
  const projectHasDownloading = projectItems.some(
    item => item.status === 'downloading',
  );
  const projectHasActiveWork = projectItems.some(item =>
    ['downloading', 'paused', 'queued'].includes(item.status),
  );

  if (projectHasPaused) {
    return 'paused';
  }

  if (workerState === 'paused' && projectHasActiveWork) {
    return 'paused';
  }

  if (
    projectHasDownloading ||
    (workerState === 'downloading' && projectHasActiveWork)
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
  const [downloadKickoff, setDownloadKickoff] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [forceIdle, setForceIdle] = useState(false);
  const [completedQueueItems, setCompletedQueueItems] = useState<
    DownloadQueueItem[]
  >([]);
  const sessionKeyRef = useRef<string | null>(null);
  const userCancelledRef = useRef(false);
  const sessionActionInFlightRef = useRef(false);
  const downloadInFlightRef = useRef(false);
  const pendingSessionActionRef = useRef<PendingSessionAction | null>(null);

  const sessionKey =
    projectId !== null ? `${projectId}:${userId ?? 'none'}` : null;

  const [inventoryRefreshGeneration, setInventoryRefreshGeneration] =
    useState(0);
  const previousSessionRef = useRef<PrepareOfflineDownloadSession>('idle');

  const releaseSessionAction = useCallback(() => {
    sessionActionInFlightRef.current = false;
    setBusy(false);
  }, []);

  const tryAcquireSessionAction = useCallback((): boolean => {
    if (sessionActionInFlightRef.current || busy) {
      return false;
    }
    sessionActionInFlightRef.current = true;
    setBusy(true);
    return true;
  }, [busy]);

  useEffect(() => {
    if (sessionKeyRef.current !== sessionKey) {
      setSessionStarted(false);
      setForceIdle(false);
      userCancelledRef.current = false;
      sessionActionInFlightRef.current = false;
      setInventoryRefreshGeneration(0);
      previousSessionRef.current = 'idle';
      setDownloadKickoff(false);
      downloadInFlightRef.current = false;
      pendingSessionActionRef.current = null;
      sessionKeyRef.current = sessionKey;
    }
  }, [sessionKey]);

  useEffect(() => {
    if (projectId === null) {
      setCompletedQueueItems([]);
      return;
    }

    let cancelled = false;
    getDownloadedResourcesByProject(projectId)
      .then(items => {
        if (!cancelled) {
          setCompletedQueueItems(items);
        }
      })
      .catch(error => {
        log.error('Failed to load downloaded resources', { error, projectId });
      });

    return () => {
      cancelled = true;
    };
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

  const derivedSession = useMemo(
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

  const session = useMemo((): PrepareOfflineDownloadSession => {
    if (downloadKickoff) {
      return 'downloading';
    }
    return derivedSession;
  }, [downloadKickoff, derivedSession]);

  useEffect(() => {
    const previousSession = previousSessionRef.current;
    previousSessionRef.current = session;

    const wasTransferring =
      previousSession === 'downloading' || previousSession === 'paused';
    const downloadSettled =
      session === 'complete' || (wasTransferring && session === 'idle');

    if (downloadSettled && previousSession !== session) {
      setInventoryRefreshGeneration(generation => generation + 1);
    }
  }, [session]);

  const inventoryRefreshSignal = String(inventoryRefreshGeneration);

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

  const handlePause = useCallback(async () => {
    if (downloadInFlightRef.current) {
      pendingSessionActionRef.current = 'pause';
      return;
    }

    if (!tryAcquireSessionAction()) {
      return;
    }
    try {
      log.info('Prepare offline download paused', { projectId });
      await pause();
    } finally {
      releaseSessionAction();
    }
  }, [pause, projectId, releaseSessionAction, tryAcquireSessionAction]);

  const handleResume = useCallback(async () => {
    if (downloadInFlightRef.current) {
      pendingSessionActionRef.current = 'resume';
      return;
    }

    if (!tryAcquireSessionAction()) {
      return;
    }
    try {
      log.info('Prepare offline download resumed', { projectId });
      setForceIdle(false);
      await resume();
    } finally {
      releaseSessionAction();
    }
  }, [projectId, releaseSessionAction, resume, tryAcquireSessionAction]);

  const handleCancel = useCallback(async () => {
    if (downloadInFlightRef.current) {
      pendingSessionActionRef.current = 'cancel';
      return;
    }

    if (!tryAcquireSessionAction()) {
      return;
    }
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
      releaseSessionAction();
    }
  }, [
    cancel,
    projectId,
    refresh,
    releaseSessionAction,
    tryAcquireSessionAction,
  ]);

  const flushPendingSessionAction = useCallback(async () => {
    const pending = pendingSessionActionRef.current;
    pendingSessionActionRef.current = null;
    if (!pending) {
      return;
    }

    if (pending === 'pause') {
      await handlePause();
      return;
    }

    if (pending === 'resume') {
      await handleResume();
      return;
    }

    await handleCancel();
  }, [handleCancel, handlePause, handleResume]);

  const handleDownload = useCallback(async () => {
    if (projectId === null || userId === null) {
      return;
    }

    if (downloadInFlightRef.current) {
      return;
    }

    downloadInFlightRef.current = true;
    setDownloadKickoff(true);
    try {
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

      if (
        projectItems.length > 0 &&
        pendingSessionActionRef.current !== 'cancel'
      ) {
        await start(projectItems);
      }
    } finally {
      downloadInFlightRef.current = false;
      setDownloadKickoff(false);
      await flushPendingSessionAction();
    }
  }, [
    canDownload,
    canDownloadNow,
    catalog.items,
    flushPendingSessionAction,
    projectId,
    refresh,
    selectedItems,
    start,
    userId,
  ]);

  return {
    session,
    busy,
    catalogWithProgress,
    downloadButtonLabel,
    canDownload: canDownloadNow,
    inventoryRefreshSignal,
    handleDownload,
    pause: handlePause,
    resume: handleResume,
    cancel: handleCancel,
  };
}
