export type SyncPageStatus =
  | 'syncing'
  | 'paused'
  | 'pending'
  | 'uploadComplete'
  | 'allComplete';

export interface SyncPageState {
  status: SyncPageStatus;
  uploadedChapters: number;
  totalChapters: number;
  nextRetryAt?: Date;
}
