import type { DownloadQueueItem } from '../types/download/types';
import {
  PrepareOfflineCatalog,
  PrepareOfflineResourceItem,
  PrepareOfflineResourceStatus,
} from '../types/prepareOffline/types';

function overlayStatusFromQueue(
  catalogStatus: PrepareOfflineResourceStatus,
  queueItem: DownloadQueueItem | undefined,
): { status: PrepareOfflineResourceStatus; progress?: number } {
  if (!queueItem) {
    return { status: catalogStatus };
  }

  switch (queueItem.status) {
    case 'downloading':
      return {
        status: 'downloading',
        progress: queueItem.progress,
      };
    case 'completed':
      return { status: 'completed' };
    case 'queued':
    case 'paused':
    case 'cancelled':
    case 'failed': {
      const partialProgress =
        queueItem.progress > 0 ? queueItem.progress : undefined;
      return partialProgress !== undefined
        ? { status: catalogStatus, progress: partialProgress }
        : { status: catalogStatus };
    }
    default:
      return { status: catalogStatus };
  }
}

function overlayItem(
  item: PrepareOfflineResourceItem,
  queueById: Map<string, DownloadQueueItem>,
): PrepareOfflineResourceItem {
  const queueItem = queueById.get(item.id);
  const { status, progress } = overlayStatusFromQueue(item.status, queueItem);

  if (status === item.status && progress === undefined) {
    return item;
  }

  return {
    ...item,
    status,
    progress,
  };
}

/**
 * Overlays download_queue status and progress onto a Prepare for Offline catalog.
 */
export function mergeQueueIntoPrepareOfflineCatalog(
  catalog: PrepareOfflineCatalog,
  queueItems: DownloadQueueItem[],
  projectId: number | null,
): PrepareOfflineCatalog {
  if (projectId === null) {
    return catalog;
  }

  const queueById = new Map<string, DownloadQueueItem>();
  for (const queueItem of queueItems) {
    if (queueItem.projectId === projectId) {
      queueById.set(queueItem.id, queueItem);
    }
  }

  if (queueById.size === 0) {
    return catalog;
  }

  const items = catalog.items.map(item => overlayItem(item, queueById));
  const groups = catalog.groups.map(group => ({
    ...group,
    items: group.items.map(item => overlayItem(item, queueById)),
  }));

  return { items, groups };
}
