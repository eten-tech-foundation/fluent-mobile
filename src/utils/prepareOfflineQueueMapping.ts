import type { EnqueueDownloadItemInput } from '../db/downloadQueueRepository';
import { getMockDownloadSource } from '../mocks/prepareOffline/mockDownloadSources';
import { PrepareOfflineResourceItem } from '../types/prepareOffline/types';

function queueKindForResource(
  kind: PrepareOfflineResourceItem['kind'],
): EnqueueDownloadItemInput['kind'] {
  return kind === 'audio' ? 'audio' : 'text';
}

/**
 * Maps a Prepare for Offline catalog row to a download_queue enqueue input.
 * Uses stable `item.id` as the queue primary key. Prefer a real `sourceUrl`
 * when present; fall back to mock fixtures until the catalog carries
 * manifest URLs (#446).
 */
export function prepareOfflineItemToEnqueueInput(
  item: PrepareOfflineResourceItem,
  projectId: number,
  userId: number,
): EnqueueDownloadItemInput {
  const mock = getMockDownloadSource(item.kind);
  const sourceUrl = item.sourceUrl?.trim() || mock.sourceUrl;
  const fileExt = item.fileExt?.trim() || mock.fileExt;

  return {
    id: item.id,
    projectId,
    userId,
    tier: item.tier,
    kind: queueKindForResource(item.kind),
    resourceName: item.groupName,
    label: item.label,
    sourceUrl,
    fileExt,
    bytesTotal: mock.bytesTotal,
  };
}

export function prepareOfflineItemsToEnqueueInputs(
  items: PrepareOfflineResourceItem[],
  projectId: number,
  userId: number,
): EnqueueDownloadItemInput[] {
  return items.map(item =>
    prepareOfflineItemToEnqueueInput(item, projectId, userId),
  );
}
