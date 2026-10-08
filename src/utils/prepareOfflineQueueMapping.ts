import type { EnqueueDownloadItemInput } from '../db/downloadQueueRepository';
import { PrepareOfflineResourceItem } from '../types/prepareOffline/types';
import { parseLabelScope } from './parseVerseScope';
/** Resources whose manifest label encodes a verse (e.g. "Genesis 1:1 (#1)"). */
const VERSE_LABELED_GROUPS = new Set([
  'Translation Notes',
  'Translation Questions',
  'Bible Commentary',
]);

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
 *
 * Also copies the manifest scope (book, chapter range) and, for resources
 * whose label carries a verse, the parsed verse range, so downloaded rows can
 * be mapped back to their place in the app offline.
 */
export function prepareOfflineItemToEnqueueInputs(
  item: PrepareOfflineResourceItem,
  projectId: number,
  userId: number,
): EnqueueDownloadItemInput[] {
  return item.manifestMembers.map(member => {
    const scope = VERSE_LABELED_GROUPS.has(item.groupName)
      ? parseLabelScope(member.label)
      : null;

    return {
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
      bookCode: member.bookCode,
      // Label chapter wins: the manifest range is only the requested range.
      startChapter: scope?.startChapter ?? member.startChapter,
      endChapter: scope?.endChapter ?? member.endChapter,
      verseStart: scope?.verseStart ?? undefined,
      verseEnd: scope?.verseEnd ?? undefined,
    };
  });
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
