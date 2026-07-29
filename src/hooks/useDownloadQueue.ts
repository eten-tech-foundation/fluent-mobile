import { useMemo } from 'react';
import type { DownloadQueueSnapshot } from '../types/download/types';

/** Flip to `true` locally to preview #147 UI on Sync screen. Do not merge enabled. */
const DEV_PREVIEW_DOWNLOAD_QUEUE = false;

export const EMPTY_DOWNLOAD_SNAPSHOT: DownloadQueueSnapshot = {
  items: [],
  completedCount: 0,
  totalCount: 0,
  aggregateProgress: 0,
};

/** Scenario 1 — design mockup: 81% on first item, rest queued. */
const DEV_PREVIEW_SCENARIO_1: DownloadQueueSnapshot = {
  items: [
    {
      id: '1',
      tier: 1,
      label: 'Source Bible',
      progress: 0.81,
      status: 'downloading',
      projectId: 1,
    },
    {
      id: '2',
      tier: 1,
      label: 'Source Bible',
      progress: 0,
      status: 'queued',
      projectId: 1,
    },
    {
      id: '3',
      tier: 2,
      label: 'Translation Notes — Mark',
      progress: 0,
      status: 'queued',
    },
    {
      id: '4',
      tier: 2,
      label: 'Translation Words — Luke',
      progress: 0,
      status: 'queued',
    },
  ],
  completedCount: 0,
  totalCount: 4,
  aggregateProgress: 0.2,
  primaryProjectId: 1,
};

/** Scenario 2 — mixed progress: 67%, 33%, 12%, 0% (+ 1 completed). */
// const DEV_PREVIEW_SCENARIO_2: DownloadQueueSnapshot = {
//   items: [
//     {
//       id: '1',
//       tier: 1,
//       label: 'Source Bible',
//       progress: 1,
//       status: 'completed',
//       projectId: 1,
//     },
//     {
//       id: '2',
//       tier: 1,
//       label: 'Source Bible',
//       progress: 0.67,
//       status: 'downloading',
//       projectId: 1,
//     },
//     {
//       id: '3',
//       tier: 2,
//       label: 'Translation Notes — Mark',
//       progress: 0.33,
//       status: 'downloading',
//     },
//     {
//       id: '4',
//       tier: 2,
//       label: 'Translation Words — Luke',
//       progress: 0.12,
//       status: 'downloading',
//     },
//     {
//       id: '5',
//       tier: 2,
//       label: 'Matthew — Audio',
//       progress: 0,
//       status: 'queued',
//     },
//   ],
//   completedCount: 1,
//   totalCount: 5,
//   aggregateProgress: 0.55,
//   primaryProjectId: 1,
// };

/** Scenario 3 — nearly complete: first three 100%, last 85%. */
// const DEV_PREVIEW_SCENARIO_3: DownloadQueueSnapshot = {
//   items: [
//     {
//       id: '1',
//       tier: 1,
//       label: 'Source Bible',
//       progress: 1,
//       status: 'downloading',
//       projectId: 1,
//     },
//     {
//       id: '2',
//       tier: 1,
//       label: 'Source Bible',
//       progress: 1,
//       status: 'downloading',
//       projectId: 1,
//     },
//     {
//       id: '3',
//       tier: 2,
//       label: 'Translation Notes — Mark',
//       progress: 1,
//       status: 'downloading',
//     },
//     {
//       id: '4',
//       tier: 2,
//       label: 'Translation Words — Luke',
//       progress: 0.85,
//       status: 'downloading',
//     },
//   ],
//   completedCount: 0,
//   totalCount: 4,
//   aggregateProgress: 0.96,
//   primaryProjectId: 1,
// };

/** Swap active scenario for device QA — comment/uncomment one export line. */
export const DEV_PREVIEW_DOWNLOAD_SNAPSHOT = DEV_PREVIEW_SCENARIO_1;
// export const DEV_PREVIEW_DOWNLOAD_SNAPSHOT = DEV_PREVIEW_SCENARIO_2;
// export const DEV_PREVIEW_DOWNLOAD_SNAPSHOT = DEV_PREVIEW_SCENARIO_3;

function hasActiveDownloads(snapshot: DownloadQueueSnapshot): boolean {
  return snapshot.items.some(item => item.status !== 'completed');
}

export function useDownloadQueue() {
  // TODO(#201): subscribe to download queue events / read from service
  const snapshot =
    __DEV__ && DEV_PREVIEW_DOWNLOAD_QUEUE
      ? DEV_PREVIEW_DOWNLOAD_SNAPSHOT
      : EMPTY_DOWNLOAD_SNAPSHOT;

  const hasDownloads = useMemo(() => hasActiveDownloads(snapshot), [snapshot]);

  return { snapshot, hasDownloads };
}
