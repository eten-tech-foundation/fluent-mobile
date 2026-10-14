import type { UploadPhase } from '../services/uploadOrchestratorCore';
import type { SyncPageStatus } from '../types/sync/types';

/**
 * Maps orchestrator phase + upload/download queue signals to Sync page UI status.
 * `allComplete` only when uploads are clear and the download queue has no
 * active work; otherwise prefer uploadComplete / pending / phase states (#147).
 */
export function deriveSyncPageStatus(
  phase: UploadPhase,
  hasPendingUploads: boolean,
  hasFailedUploads: boolean,
  hasUnuploadablePending = false,
  countsUnknown = false,
  /** Pending offline claims or Sync metadata errors that need Sync Now (#611). */
  hasClaimsOrSyncRetryWork = false,
  /** Active download-queue work (queued/downloading/paused/failed). */
  hasDownloads = false,
): SyncPageStatus {
  if (phase === 'syncing') {
    return 'syncing';
  }
  if (phase === 'paused') {
    return 'paused';
  }

  const hasUploadWorkRemaining =
    hasPendingUploads ||
    hasFailedUploads ||
    hasUnuploadablePending ||
    countsUnknown ||
    hasClaimsOrSyncRetryWork;
  if (hasUploadWorkRemaining) {
    return 'pending';
  }

  if (hasDownloads) {
    return 'uploadComplete';
  }

  return 'allComplete';
}
