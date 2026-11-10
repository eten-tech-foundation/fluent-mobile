export type SyncPageStatus =
  | 'syncing'
  | 'paused'
  /** Pending upload work is waiting for the drafting hold to lift (#886). */
  | 'held'
  | 'pending'
  | 'uploadComplete'
  | 'allComplete';

export interface SyncPageState {
  status: SyncPageStatus;
  uploadedChapters: number;
  totalChapters: number;
  nextRetryAt?: Date;
}
