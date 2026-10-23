import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DraftDownloadRequest,
  DraftDownloadState,
} from '../types/draftDownload/types';
import {
  getDraftDownloadState,
  startDraftDownload,
  type StartDraftDownloadResult,
} from '../services/draftDownload';
import { draftSessionKey } from '../services/draftDownloadIds';
import { onDownloadQueueChanged } from '../utils/downloadQueueEvents';

const NULL_STATE: DraftDownloadState = {
  chapterAssignmentId: 0,
  role: 'peer_check',
  status: 'idle',
  phase: 'idle',
  progress: 0,
  readyAtMs: null,
};

function idleState(
  request: Pick<DraftDownloadRequest, 'chapterAssignmentId' | 'role'>,
): DraftDownloadState {
  return {
    chapterAssignmentId: request.chapterAssignmentId,
    role: request.role,
    status: 'idle',
    phase: 'idle',
    progress: 0,
    readyAtMs: null,
  };
}

function requestKey(request: DraftDownloadRequest | null): string | null {
  if (!request) return null;
  return draftSessionKey(request);
}

/**
 * Chip-facing state for one chapter's draft download. MyWork owns when to mount.
 * Stable request identity: ignores stale async refreshes after null/change.
 */
export function useDraftDownload(request: DraftDownloadRequest | null): {
  state: DraftDownloadState;
  start: () => Promise<StartDraftDownloadResult>;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<DraftDownloadState>(() =>
    request ? idleState(request) : NULL_STATE,
  );
  const requestRef = useRef(request);
  const keyRef = useRef(requestKey(request));
  const refreshGenRef = useRef(0);
  /** One getDraftDownloadState in flight; coalesce overlapping polls. */
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    requestRef.current = request;
    const nextKey = requestKey(request);
    if (keyRef.current !== nextKey) {
      keyRef.current = nextKey;
      refreshGenRef.current += 1;
      refreshQueuedRef.current = false;
      setState(request ? idleState(request) : NULL_STATE);
    }
  }, [request]);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      do {
        refreshQueuedRef.current = false;
        const current = requestRef.current;
        const key = requestKey(current);
        if (!current || !key) return;
        const generation = ++refreshGenRef.current;
        const next = await getDraftDownloadState(current);
        if (
          generation !== refreshGenRef.current ||
          requestKey(requestRef.current) !== key
        ) {
          continue;
        }
        setState(next);
      } while (refreshQueuedRef.current);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const stableKey = requestKey(request);

  useEffect(() => {
    void refresh();
  }, [refresh, stableKey]);

  useEffect(() => {
    if (!stableKey) return;
    return onDownloadQueueChanged(() => {
      void refresh();
    });
  }, [stableKey, refresh]);

  useEffect(() => {
    if (
      state.status !== 'downloading' &&
      state.status !== 'queued' &&
      state.status !== 'ready'
    ) {
      return;
    }
    const id = setInterval(() => {
      void refresh();
    }, 500);
    return () => clearInterval(id);
  }, [state.status, refresh]);

  const start = useCallback(async () => {
    const current = requestRef.current;
    if (!current) {
      return {
        ok: false as const,
        reason: 'error' as const,
        message: 'No request',
      };
    }
    const result = await startDraftDownload(current);
    await refresh();
    return result;
  }, [refresh]);

  return { state, start, refresh };
}
