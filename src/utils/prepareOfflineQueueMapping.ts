import type { EnqueueDownloadItemInput } from '../db/downloadQueueRepository';
import { PrepareOfflineResourceItem } from '../types/prepareOffline/types';

function queueKindForResource(
  kind: PrepareOfflineResourceItem['kind'],
): EnqueueDownloadItemInput['kind'] {
  return kind;
}

/**
 * Expands one Prepare for Offline catalog row (which may aggregate several
 * real manifest items, e.g. every Translation Words entry) into one real
 * download_queue enqueue input per underlying manifest item, using each
 * item's real sourceUrl/fileExt/bytesTotal from the API manifest (#504).
 */
export function prepareOfflineItemToEnqueueInputs(
  item: PrepareOfflineResourceItem,
  projectId: number,
  userId: number,
): EnqueueDownloadItemInput[] {
  return item.manifestMembers.map(member => ({
    id: member.id,
    projectId,
    userId,
    tier: item.tier,
    kind: queueKindForResource(item.kind),
    resourceName: item.groupName,
    label: member.label,
    sourceUrl: member.sourceUrl,
    fileExt: member.fileExt,
    bytesTotal: member.bytesTotal,
    serializedContent: member.serializedContent,
  }));
}

export function prepareOfflineItemsToEnqueueInputs(
  items: PrepareOfflineResourceItem[],
  projectId: number,
  userId: number,
): EnqueueDownloadItemInput[] {
  return items.flatMap(item =>
    prepareOfflineItemToEnqueueInputs(item, projectId, userId),
  );
}
