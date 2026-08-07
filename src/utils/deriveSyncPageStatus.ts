import type { UploadPhase } from '../services/uploadOrchestratorCore';
import type { SyncPageStatus } from '../types/sync/types';

/**
 * Maps orchestrator phase + DB pending/failed counts to Sync page UI status.
 * Does not derive `allComplete` (blocked on download-queue signal, #149).
 */
export function deriveSyncPageStatus(
  phase: UploadPhase,
  hasPendingUploads: boolean,
  hasFailedUploads: boolean,
): SyncPageStatus {
  if (phase === 'syncing') {
    return 'syncing';
  }
  if (phase === 'paused') {
    return 'paused';
  }

  const hasWorkRemaining = hasPendingUploads || hasFailedUploads;
  if (hasWorkRemaining) {
    return 'pending';
  }

  if (phase === 'idle') {
    return 'uploadComplete';
  }

  // waiting_wifi / offline with nothing left to upload
  return 'uploadComplete';
}
