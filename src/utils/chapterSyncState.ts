import { ChapterSyncState } from '../types/db/types';

export function deriveChapterSyncState(
  recordingCount: number,
  pendingCount: number,
): ChapterSyncState {
  if (recordingCount === 0) {
    return 'none';
  }

  if (pendingCount > 0) {
    return 'deviceOnly';
  }

  return 'synced';
}
