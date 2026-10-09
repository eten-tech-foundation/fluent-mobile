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
  /**
   * #620: true when the pending or unuploadable count read failed. The counts
   * above are then the last known values, not fresh ones, so consumers must
   * not present them as "All synced".
   */
  countsUnknown: boolean;
  isUploading: boolean;
  uploadProgress: UploadProgress | null;
}

export const EMPTY_SYNC_STATUS_SNAPSHOT: SyncStatusSnapshot = {
  pendingCount: 0,
  pendingChapterCount: 0,
  failedCount: 0,
  unuploadableCount: 0,
  failedErrorText: null,
  countsUnknown: false,
  isUploading: false,
  uploadProgress: null,
};

let snapshot: SyncStatusSnapshot = EMPTY_SYNC_STATUS_SNAPSHOT;
let refreshGeneration = 0;

/**
 * #621: an upload just finished — hold `isUploading` true and swap it to
 * false in the same commit as the post-upload counts (see
 * `applyUploadSessionEvent`). Only `complete`/`idle` set this.
 */
let pendingFinalRefresh = false;

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
    a.countsUnknown === b.countsUnknown &&
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
      // For complete/idle this re-read also flips `isUploading` off (see
      // applyUploadSessionEvent) so the spinner never shows one frame of
      // the pre-upload "pending" counts.
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

async function loadFailedUploadCount(): Promise<number> {
  try {
    return await getFailedUploadCount();
  } catch (error) {
    log.error('Failed to load failed upload count', { error });
    return 0;
  }
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
    pendingFinalRefresh = false;
  } else if (event.type === 'complete' || event.type === 'idle') {
    // #621: hold isUploading until the refreshed counts land, then swap
    // both in one commit (see refreshSyncStatusStore).
    pendingFinalRefresh = true;
    uploadProgress = null;
  } else if (
    event.type === 'cancelled' ||
    event.type === 'paused' ||
    event.type === 'waiting_wifi'
  ) {
    // These finalize no rows, so counts are accurate: flip now and keep
    // progress so a paused bar stays frozen (#149).
    isUploading = false;
  }
  commit({ ...snapshot, isUploading, uploadProgress });
}

/**
 * Re-read pending/failed upload counts from SQLite into the shared snapshot.
 * Concurrent calls are safe: only the newest generation may commit.
 *
 * #620: reads are settled independently. A rejected pending or unuploadable
 * read keeps its last known value and sets `countsUnknown`, instead of being
 * treated as zero.
 */
export async function refreshSyncStatusStore(): Promise<void> {
  const generation = ++refreshGeneration;
  try {
    const [pending, failed, failedError, chapters, unuploadable] =
      await Promise.allSettled([
        getPendingUploadCount(),
        loadFailedUploadCount(),
        loadFailedUploadErrorText(),
        getPendingUploadChapters(),
        getUnuploadablePendingSummary(),
      ]);
    if (generation !== refreshGeneration) {
      return;
    }

    let failedCount = snapshot.failedCount;
    let failedErrorText = snapshot.failedErrorText;
    if (failed.status === 'fulfilled') {
      failedCount = failed.value;
      failedErrorText =
        failed.value > 0 && failedError.status === 'fulfilled'
          ? failedError.value
          : null;
    }

    commit({
      pendingCount:
        pending.status === 'fulfilled' ? pending.value : snapshot.pendingCount,
      pendingChapterCount:
        chapters.status === 'fulfilled'
          ? chapters.value.length
          : snapshot.pendingChapterCount,
      failedCount,
      failedErrorText,
      unuploadableCount:
        unuploadable.status === 'fulfilled'
          ? unuploadable.value.total
          : snapshot.unuploadableCount,
      countsUnknown:
        pending.status === 'rejected' || unuploadable.status === 'rejected',
      isUploading: pendingFinalRefresh ? false : snapshot.isUploading,
      uploadProgress: snapshot.uploadProgress,
    });
    pendingFinalRefresh = false;
  } catch (error) {
    if (pendingFinalRefresh) {
      // The re-read failed; end the upload anyway so the spinner cannot
      // wedge (uploadProgress is already null, so a re-read retry shows
      // the spinner without counts, not stale ones).
      pendingFinalRefresh = false;
      commit({ ...snapshot, isUploading: false });
    }
    log.error('Failed to refresh sync status store', { error });
  }
}

/** Clear the snapshot and cancel in-flight refreshes (sign-out / user switch). */
export function resetSyncStatusStore(): void {
  refreshGeneration += 1;
  pendingFinalRefresh = false;
  const changed = !snapshotEquals(snapshot, EMPTY_SYNC_STATUS_SNAPSHOT);
  snapshot = EMPTY_SYNC_STATUS_SNAPSHOT;
  if (changed) {
    [...listeners].forEach(fn => fn());
  }
}

/** Test hook: drop in-flight refreshes and restore the empty snapshot. */
export function resetSyncStatusStoreForTests(): void {
  refreshGeneration += 1;
  pendingFinalRefresh = false;
  snapshot = EMPTY_SYNC_STATUS_SNAPSHOT;
}
