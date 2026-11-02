import { ChapterSyncState } from '../types/db/types';

export function deriveChapterSyncState(
  recordingCount: number,
  pendingCount: number,
  hasPendingStageAdvance = false,
): ChapterSyncState {
  if (recordingCount === 0 && !hasPendingStageAdvance) {
    return 'none';
  }

  if (pendingCount > 0 || hasPendingStageAdvance) {
    return 'deviceOnly';
  }

  return 'synced';
}
