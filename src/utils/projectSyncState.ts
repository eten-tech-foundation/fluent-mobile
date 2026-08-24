import { ProjectSyncState } from '../types/db/types';

export function deriveProjectSyncState(
  recordingCount: number,
  pendingUploadCount: number,
  pendingStageCount = 0,
): ProjectSyncState {
  if (pendingUploadCount > 0 || pendingStageCount > 0) {
    return 'unsynced';
  }

  if (recordingCount === 0) {
    return 'none';
  }

  return 'synced';
}
