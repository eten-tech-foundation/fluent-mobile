import { ProjectSyncState } from '../types/db/types';

export function deriveProjectSyncState(
  recordingCount: number,
  pendingCount: number,
): ProjectSyncState {
  if (recordingCount === 0) {
    return 'none';
  }

  if (pendingCount > 0) {
    return 'unsynced';
  }

  return 'synced';
}
