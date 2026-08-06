export type DownloadTier = 1 | 2 | 3;

export type DownloadQueueStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'failed';

export interface DownloadQueueItem {
  id: string;
  tier: DownloadTier;
  kind?: 'text' | 'audio';
  resourceName?: string;
  label: string;
  progress: number;
  status: DownloadQueueStatus;
  projectId?: number;
  sourceUrl?: string;
  fileExt?: string;
  bytesTotal?: number;
  localFilePath?: string;
  resumeData?: string;
}

export interface DownloadQueueSnapshot {
  items: DownloadQueueItem[];
  completedCount: number;
  totalCount: number;
  aggregateProgress: number;
  primaryProjectId?: number;
}

export interface DownloadedProjectInventory {
  projectId: number;
  resources: DownloadQueueItem[];
  totalBytes: number;
}
