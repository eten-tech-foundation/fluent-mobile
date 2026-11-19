import { useMemo } from 'react';
import { useConnectivity } from '../../../../hooks/useConnectivity';
import { useImagesMapsForUnit } from '../../../../hooks/useImagesMapsForUnit';
import { useResourcesInventory } from '../../../../hooks/useResourcesInventory';
import type { ImagesMapsItem } from '../../../../types/resources/imagesMaps';
import { verseRefsKey } from '../../../../utils/loadResourcesForVerseRange';
import { getInventoriedResourceSections } from '../../../../utils/resourcesSectionInventory';
import type { Ready } from './ready';

export type PassageImagesState =
  | { status: 'loading' }
  /** Offline, and Prepare for Offline hasn't downloaded them. */
  | { status: 'unprepared' }
  /**
   * Offline with none found. Downloads are per chapter, so this chapter may
   * just not be downloaded; never read it as confirmed empty.
   */
  | { status: 'noneOffline' }
  /** A whole chapter whose text isn't here yet, so its verses aren't known. */
  | { status: 'noVerses' }
  | { status: 'failed' }
  | { status: 'ready'; items: ImagesMapsItem[] };

/**
 * Images and maps for the whole passage, or the whole chapter in verse mode,
 * from the same loader as Legacy's Resources tab: downloaded first (those are
 * chapter-level), the API only when online. Loads once `enabled`, and never
 * before connectivity resolves, so an unknown network isn't read as offline.
 */
export function usePassageImages({
  passage,
  userId,
  enabled,
  firstVerses,
}: {
  passage: Ready;
  userId: number | null;
  enabled: boolean;
  /** Only the passage's first verses, e.g. for a few previews. */
  firstVerses?: number;
}) {
  const { assignment, verses } = passage;
  const { isOnline, hasResolved } = useConnectivity();
  const online = hasResolved && isOnline;
  const projectId = assignment.projectId ?? null;
  const verseRefs = useMemo(
    () =>
      verses.slice(0, firstVerses).map(v => ({
        chapterNumber: v.chapterNumber,
        verseNumber: v.verseNumber,
      })),
    [verses, firstVerses],
  );
  const { getResourceStatus, downloadedSections } = useResourcesInventory(
    projectId,
    userId,
  );
  const prepared = getInventoriedResourceSections(
    getResourceStatus,
    downloadedSections,
  ).includes('imagesMaps');
  const languageCode = assignment.sourceLanguageCode;
  const noVerses = verseRefs.length === 0;
  const { state, retry } = useImagesMapsForUnit({
    projectId: enabled && hasResolved && !noVerses ? projectId : null,
    userId,
    isOnline: online,
    bookCode: assignment.bookCode ?? '',
    chapterNumber: verseRefs[0]?.chapterNumber ?? assignment.chapterNumber,
    verseNumber: verseRefs[0]?.verseNumber ?? 1,
    verseRefs,
    languageCode,
  });

  let images: PassageImagesState;
  if (noVerses) {
    images = { status: 'noVerses' };
  } else if (!enabled || !hasResolved || state.status === 'loading') {
    images = { status: 'loading' };
  } else if (state.status === 'error') {
    images = { status: 'failed' };
  } else if (state.items.length === 0 && !online && projectId !== null) {
    images = { status: prepared ? 'noneOffline' : 'unprepared' };
  } else {
    images = { status: 'ready', items: state.items };
  }
  // Changes with whatever the images are for, so stale viewers close.
  const scope = `${projectId}:${userId}:${languageCode}:${
    assignment.bookCode
  }:${verseRefsKey(verseRefs)}`;
  return { state: images, retry, scope };
}
