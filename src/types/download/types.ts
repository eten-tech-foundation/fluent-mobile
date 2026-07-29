export type DownloadTier = 1 | 2 | 3;

export interface DownloadQueueItem {
  id: string;
  tier: DownloadTier;
  label: string;
  progress: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  projectId?: number;
}

export interface DownloadQueueSnapshot {
  items: DownloadQueueItem[];
  completedCount: number;
  totalCount: number;
  aggregateProgress: number;
  primaryProjectId?: number;
}
