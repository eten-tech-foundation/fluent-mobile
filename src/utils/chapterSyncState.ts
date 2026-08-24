import { ChapterSyncState } from '../types/db/types';

/**
 * Chapter row cloud indicator (#32 / #257).
 * Pending = unsynced audio and/or queued stage advance.
 */
export function deriveChapterSyncState(
  recordingCount: number,
  pendingUploadCount: number,
  pendingStageCount = 0,
): ChapterSyncState {
  if (pendingUploadCount > 0 || pendingStageCount > 0) {
    return 'deviceOnly';
  }

  if (recordingCount === 0) {
    return 'none';
  }

  return 'synced';
}
