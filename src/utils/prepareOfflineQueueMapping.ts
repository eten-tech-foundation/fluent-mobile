import type { EnqueueDownloadItemInput } from '../db/downloadQueueRepository';
import type {
  PrepareOfflineResourceItem,
  PrepareOfflineResourceManifestItem,
} from '../types/prepareOffline/types';
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
 * Persists each resource's actual scope, preferring parsed labels where
 * available. Legacy multi-chapter fields can describe the request range,
 * so they cannot establish a resource's coverage.
 */
export function prepareOfflineItemToEnqueueInputs(
  item: PrepareOfflineResourceItem,
  projectId: number,
  userId: number,
): EnqueueDownloadItemInput[] {
  return item.manifestMembers.map(member => {
    const labelScope = VERSE_LABELED_GROUPS.has(item.groupName)
      ? parseLabelScope(member.label)
      : null;
    const legacyChapter =
      member.startChapter === member.endChapter
        ? member.startChapter
        : undefined;
    const manifestScope: PrepareOfflineResourceManifestItem['scope'] =
      member.scope ?? {
        startChapter: legacyChapter,
        endChapter: legacyChapter,
      };
    const scope =
      labelScope && labelScope.startChapter !== null
        ? labelScope
        : manifestScope;

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
      bookCode: member.scope?.bookCode ?? member.bookCode,
      startChapter: scope.startChapter ?? undefined,
      endChapter: scope.endChapter ?? undefined,
      verseStart: scope.verseStart ?? undefined,
      verseEnd: scope.verseEnd ?? undefined,
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
