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
 * Uses stable `item.id` as the queue primary key.
 */
export function prepareOfflineItemToEnqueueInput(
  item: PrepareOfflineResourceItem,
  projectId: number,
  userId: number,
): EnqueueDownloadItemInput {
  const { sourceUrl, fileExt, bytesTotal } = getMockDownloadSource(item.kind);

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
    bytesTotal,
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
