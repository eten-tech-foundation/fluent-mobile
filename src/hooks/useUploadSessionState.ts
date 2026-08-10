import { useCallback, useEffect, useState } from 'react';
import type { UploadProgress } from './usePendingUploads';
import {
  cancelUploadSession,
  getUploadSessionSnapshot,
  pauseUploadSession,
  syncNowUploads,
  type UploadOrchestratorSnapshot,
} from '../services/uploadOrchestrator';
import type { UploadPhase } from '../services/uploadOrchestratorCore';
import { onUploadSessionEvent } from '../services/syncEvents';
import { deriveSyncPageStatus } from '../utils/deriveSyncPageStatus';
import type { SyncPageStatus } from '../types/sync/types';

const IDLE_SNAPSHOT: UploadOrchestratorSnapshot = {
  phase: 'idle',
  completedChapters: 0,
  totalChapters: 0,
  pausedUntilMs: null,
};

function readSnapshot(): UploadOrchestratorSnapshot {
  try {
    return getUploadSessionSnapshot();
  } catch {
    return IDLE_SNAPSHOT;
  }
}

export interface UseUploadSessionStateOptions {
  hasPendingUploads: boolean;
  hasFailedUploads: boolean;
  uploadProgress: UploadProgress | null;
}

export interface UseUploadSessionStateResult {
  pageStatus: SyncPageStatus;
  progressUploaded: number;
  progressTotal: number;
  nextRetryAt: Date | undefined;
  sessionError: string | null;
  isControlPending: boolean;
  isStartControlPending: boolean;
  pause: () => Promise<void>;
  cancel: () => Promise<void>;
  resumeUploads: () => Promise<void>;
  syncNowUploads: () => Promise<void>;
}

export function useUploadSessionState({
  hasPendingUploads,
  hasFailedUploads,
  uploadProgress,
}: UseUploadSessionStateOptions): UseUploadSessionStateResult {
  const [snapshot, setSnapshot] =
    useState<UploadOrchestratorSnapshot>(readSnapshot);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isControlPending, setIsControlPending] = useState(false);
  const [isStartControlPending, setIsStartControlPending] = useState(false);
  const [optimisticPhase, setOptimisticPhase] = useState<UploadPhase | null>(
    null,
  );

  const refreshSnapshot = useCallback(() => {
    setSnapshot(readSnapshot());
  }, []);

  useEffect(() => {
    refreshSnapshot();
    return onUploadSessionEvent(() => {
      refreshSnapshot();
    });
  }, [refreshSnapshot]);

  useEffect(() => {
    if (optimisticPhase !== null && snapshot.phase === optimisticPhase) {
      setOptimisticPhase(null);
    }
  }, [optimisticPhase, snapshot.phase]);

  const effectivePhase = optimisticPhase ?? snapshot.phase;

  const pageStatus = deriveSyncPageStatus(
    effectivePhase,
    hasPendingUploads,
    hasFailedUploads,
  );

  const progressUploaded =
    uploadProgress?.completed ?? snapshot.completedChapters;
  const progressTotal = uploadProgress?.total ?? snapshot.totalChapters;

  const nextRetryAt =
    snapshot.pausedUntilMs !== null
      ? new Date(snapshot.pausedUntilMs)
      : undefined;

  const runInterruptControl = useCallback(
    async (
      action: () => Promise<void>,
      phaseAfterClick: UploadPhase | null,
    ) => {
      setOptimisticPhase(phaseAfterClick);
      setIsControlPending(true);
      setSessionError(null);
      try {
        await action();
        refreshSnapshot();
        setOptimisticPhase(null);
      } catch (error) {
        setOptimisticPhase(null);
        const message =
          error instanceof Error ? error.message : 'Upload control failed';
        setSessionError(message);
      } finally {
        setIsControlPending(false);
      }
    },
    [refreshSnapshot],
  );

  /** Sync Now / Resume — do not block Pause/Cancel for the full upload session. */
  const runStartControl = useCallback(
    async (
      action: () => Promise<void>,
      phaseAfterClick: UploadPhase | null,
    ) => {
      setOptimisticPhase(phaseAfterClick);
      setIsStartControlPending(true);
      setSessionError(null);
      try {
        await action();
        refreshSnapshot();
        setOptimisticPhase(null);
      } catch (error) {
        setOptimisticPhase(null);
        const message =
          error instanceof Error ? error.message : 'Upload control failed';
        setSessionError(message);
      } finally {
        setIsStartControlPending(false);
      }
    },
    [refreshSnapshot],
  );

  const pause = useCallback(
    () => runInterruptControl(pauseUploadSession, 'paused'),
    [runInterruptControl],
  );
  const cancel = useCallback(
    () => runInterruptControl(cancelUploadSession, 'idle'),
    [runInterruptControl],
  );
  const resumeUploads = useCallback(
    () => runStartControl(syncNowUploads, 'syncing'),
    [runStartControl],
  );
  const syncNow = useCallback(
    () => runStartControl(syncNowUploads, 'syncing'),
    [runStartControl],
  );

  return {
    pageStatus,
    progressUploaded,
    progressTotal,
    nextRetryAt,
    sessionError,
    isControlPending,
    isStartControlPending,
    pause,
    cancel,
    resumeUploads,
    syncNowUploads: syncNow,
  };
}
