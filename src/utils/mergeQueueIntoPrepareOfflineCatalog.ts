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
    case 'paused':
      return {
        status: 'paused',
        progress: queueItem.progress,
      };
    case 'completed':
      return { status: 'completed' };
    case 'queued':
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

function legacyOverlayItem(
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
 * Aggregates queue state across one catalog row's manifest members (#504).
 *
 * Status: every member completed → completed; any downloading → downloading;
 * any paused (and none downloading) → paused; otherwise the catalog baseline.
 *
 * Progress is byte-weighted over the row's members: members without a queue
 * row (never enqueued) contribute their bytes as not-yet-started, completed
 * members contribute their full bytes.
 */
function aggregateOverlayItem(
  item: PrepareOfflineResourceItem,
  queueById: Map<string, DownloadQueueItem>,
): PrepareOfflineResourceItem {
  const members = item.manifestMembers;
  if (!members || members.length === 0) {
    return legacyOverlayItem(item, queueById);
  }

  const rows = members.map(member => queueById.get(member.id) ?? null);
  if (rows.every(row => row === null)) {
    // No member-keyed rows — fall back to queue rows keyed by the row id
    // itself (legacy enqueues / direct id matches).
    return legacyOverlayItem(item, queueById);
  }

  const allCompleted =
    rows.length > 0 && rows.every(row => row?.status === 'completed');
  const anyDownloading = rows.some(row => row?.status === 'downloading');
  const anyPaused = rows.some(row => row?.status === 'paused');

  let status = item.status;
  if (allCompleted) {
    status = 'completed';
  } else if (anyDownloading) {
    status = 'downloading';
  } else if (anyPaused) {
    status = 'paused';
  }

  const totalBytes = members.reduce((sum, m) => sum + (m.bytesTotal || 0), 0);
  const writtenBytes = members.reduce(
    (sum, m, index) =>
      sum +
      (rows[index] ? (rows[index]!.progress || 0) * (m.bytesTotal || 0) : 0),
    0,
  );

  let progress: number | undefined;
  if (totalBytes > 0) {
    progress = writtenBytes / totalBytes;
  } else {
    const present = rows.filter(
      (row): row is DownloadQueueItem => row !== null,
    );
    progress =
      present.length > 0
        ? present.reduce((sum, row) => sum + (row.progress || 0), 0) /
          present.length
        : undefined;
  }

  if (status === 'completed') {
    return { ...item, status };
  }

  if (status === item.status && (!progress || progress <= 0)) {
    return item;
  }

  return {
    ...item,
    status,
    progress: progress && progress > 0 ? progress : undefined,
  };
}

/**
 * Overlays download_queue status and progress onto a Prepare for Offline catalog.
 * Queue rows are keyed by manifest item id; catalog rows aggregate members,
 * so status/progress are re-aggregated per row (#504).
 */
export function mergeQueueIntoPrepareOfflineCatalog(
  catalog: PrepareOfflineCatalog,
  queueItems: DownloadQueueItem[],
  projectId: number | null,
  userId?: number | null,
): PrepareOfflineCatalog {
  if (projectId === null) {
    return catalog;
  }

  const queueById = new Map<string, DownloadQueueItem>();
  for (const queueItem of queueItems) {
    if (queueItem.projectId !== projectId) continue;
    if (userId !== null && userId !== undefined && queueItem.userId !== userId)
      continue;
    queueById.set(queueItem.resourceId ?? queueItem.id, queueItem);
  }

  if (queueById.size === 0) {
    return catalog;
  }

  const items = catalog.items.map(item =>
    aggregateOverlayItem(item, queueById),
  );
  const groups = catalog.groups.map(group => ({
    ...group,
    items: group.items.map(item => aggregateOverlayItem(item, queueById)),
  }));

  return { items, groups };
}
