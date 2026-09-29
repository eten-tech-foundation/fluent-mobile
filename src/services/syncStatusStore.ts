import {
  getFailedUploadCount,
  getFailedUploadErrorSummary,
  getPendingUploadChapters,
  getPendingUploadCount,
  getUnuploadablePendingSummary,
} from '../db/queries';
import { onRecordingDataChanged } from './recordingDataEvents';
import { onUploadSessionEvent, type UploadSessionEvent } from './syncEvents';
import { logger } from '../utils/logger';
import { sanitizeUploadErrorForDisplay } from '../utils/sanitizeUploadError';

const log = logger.create('syncStatusStore');

export interface UploadProgress {
  completed: number;
  total: number;
}

/**
 * Shared sync-status snapshot — the single source feeding every header and
 * the Sync page (#38, #101; audit #530). All consumers subscribe through
 * `usePendingUploads`, so they see the same values at the same time instead
 * of each screen running its own query instances on divergent triggers.
 */
export interface SyncStatusSnapshot {
  pendingCount: number;
  pendingChapterCount: number;
  failedCount: number;
  unuploadableCount: number;
  failedErrorText: string | null;
  isUploading: boolean;
  uploadProgress: UploadProgress | null;
}

export const EMPTY_SYNC_STATUS_SNAPSHOT: SyncStatusSnapshot = {
  pendingCount: 0,
  pendingChapterCount: 0,
  failedCount: 0,
  unuploadableCount: 0,
  failedErrorText: null,
  isUploading: false,
  uploadProgress: null,
};

let snapshot: SyncStatusSnapshot = EMPTY_SYNC_STATUS_SNAPSHOT;
let refreshGeneration = 0;

type SyncStatusListener = () => void;
const listeners: SyncStatusListener[] = [];

export function getSyncStatusSnapshot(): SyncStatusSnapshot {
  return snapshot;
}

function snapshotEquals(a: SyncStatusSnapshot, b: SyncStatusSnapshot): boolean {
  return (
    a.pendingCount === b.pendingCount &&
    a.pendingChapterCount === b.pendingChapterCount &&
    a.failedCount === b.failedCount &&
    a.unuploadableCount === b.unuploadableCount &&
    a.failedErrorText === b.failedErrorText &&
    a.isUploading === b.isUploading &&
    a.uploadProgress?.completed === b.uploadProgress?.completed &&
    a.uploadProgress?.total === b.uploadProgress?.total
  );
}

function commit(next: SyncStatusSnapshot): void {
  // Keep the previous reference when nothing changed so subscribers that use
  // the snapshot identity (useSyncExternalStore) do not re-render needlessly.
  if (snapshotEquals(next, snapshot)) {
    return;
  }
  snapshot = next;
  // Copy so a listener that unsubscribes mid-emit cannot skip later ones.
  [...listeners].forEach(fn => fn());
}

export function subscribeToSyncStatusStore(fn: SyncStatusListener): () => void {
  ensureStoreSubscriptions();
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

let unsubscribes: (() => void)[] | null = null;

/** Wire the app-lifetime triggers once, on the first subscriber. */
function ensureStoreSubscriptions(): void {
  if (unsubscribes) {
    return;
  }
  unsubscribes = [
    onUploadSessionEvent(event => {
      applyUploadSessionEvent(event);
      // Counts change as the worker marks rows uploaded/failed — re-read
      // (same behavior as the previous per-hook eventTick reload).
      void refreshSyncStatusStore();
    }),
    // A take was saved or deleted (#530 A.1/A.2) — re-read immediately.
    onRecordingDataChanged(() => {
      void refreshSyncStatusStore();
    }),
  ];
}

function progressFromEvent(event: UploadSessionEvent): UploadProgress | null {
  if (event.type === 'start') {
    return { completed: 0, total: event.totalChapters };
  }
  if (event.type === 'progress') {
    return {
      completed: event.completedChapters,
      total: event.totalChapters,
    };
  }
  return null;
}

async function loadFailedUploadErrorText(): Promise<string | null> {
  try {
    const summary = await getFailedUploadErrorSummary();
    if (!summary) {
      return null;
    }
    const sanitized = sanitizeUploadErrorForDisplay(summary.latestMessage);
    const suffix =
      summary.extraDistinctCount > 0
        ? ` (+${summary.extraDistinctCount} more)`
        : '';
    return `${sanitized}${suffix}`;
  } catch (error) {
    log.error('Failed to load failed upload error text', { error });
    return null;
  }
}

function applyUploadSessionEvent(event: UploadSessionEvent): void {
  const progress = progressFromEvent(event);
  let isUploading = snapshot.isUploading;
  let uploadProgress = snapshot.uploadProgress;
  if (progress) {
    isUploading = true;
    uploadProgress = progress;
  } else if (
    event.type === 'complete' ||
    event.type === 'idle' ||
    event.type === 'cancelled' ||
    event.type === 'paused' ||
    event.type === 'waiting_wifi'
  ) {
    isUploading = false;
    if (event.type === 'complete' || event.type === 'idle') {
      uploadProgress = null;
    }
  }
  commit({ ...snapshot, isUploading, uploadProgress });
}

/**
 * Re-read pending/failed upload counts from SQLite into the shared snapshot.
 * Concurrent calls are safe: only the newest generation may commit.
 */
export async function refreshSyncStatusStore(): Promise<void> {
  const generation = ++refreshGeneration;
  try {
    const [pending, failed, failedError, chapters, unuploadable] =
      await Promise.all([
        getPendingUploadCount(),
        getFailedUploadCount(),
        loadFailedUploadErrorText(),
        getPendingUploadChapters(),
        getUnuploadablePendingSummary(),
      ]);
    if (generation !== refreshGeneration) {
      return;
    }
    commit({
      pendingCount: pending,
      pendingChapterCount: chapters.length,
      failedCount: failed,
      failedErrorText: failed > 0 ? failedError : null,
      unuploadableCount: unuploadable.total,
      isUploading: snapshot.isUploading,
      uploadProgress: snapshot.uploadProgress,
    });
  } catch (error) {
    log.error('Failed to refresh sync status store', { error });
  }
}

/** Test hook: drop in-flight refreshes and restore the empty snapshot. */
export function resetSyncStatusStoreForTests(): void {
  refreshGeneration += 1;
  snapshot = EMPTY_SYNC_STATUS_SNAPSHOT;
}
