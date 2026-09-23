import { PrepareOfflineChapterRow } from '../types/prepareOffline/types';

export interface PrepareOfflineManifestContext {
  languageCode: string;
  bookCode: string;
  startChapter: number;
  endChapter: number;
  bibleId: number;
}

const MAX_CHAPTERS_PER_MANIFEST_CALL = 20;

/**
 * Groups selected chapters by book and splits each book's range into
 * ≤20-chapter chunks (the API's manifest limit). May include unselected
 * chapters that fall inside a selected range — acceptable over-fetch since
 * the manifest is metadata/sizes only (#504).
 */
export function buildManifestContexts(
  chapters: PrepareOfflineChapterRow[],
  selectedIds: Set<number>,
  sourceLanguageCode: string,
): PrepareOfflineManifestContext[] {
  const selectedByBook = new Map<
    string,
    { chapterNumbers: number[]; bibleId: number }
  >();

  for (const chapter of chapters) {
    if (!selectedIds.has(chapter.id)) continue;
    const entry = selectedByBook.get(chapter.bookCode);
    if (entry) {
      entry.chapterNumbers.push(chapter.chapterNumber);
      if (entry.bibleId !== chapter.bibleId) {
        throw new Error(
          `Inconsistent bibleId within book ${chapter.bookCode}: ${entry.bibleId} vs ${chapter.bibleId}`,
        );
      }
    } else {
      selectedByBook.set(chapter.bookCode, {
        chapterNumbers: [chapter.chapterNumber],
        bibleId: chapter.bibleId,
      });
    }
  }

  const contexts: PrepareOfflineManifestContext[] = [];

  for (const [bookCode, { chapterNumbers, bibleId }] of selectedByBook) {
    const min = Math.min(...chapterNumbers);
    const max = Math.max(...chapterNumbers);

    for (
      let start = min;
      start <= max;
      start += MAX_CHAPTERS_PER_MANIFEST_CALL
    ) {
      const end = Math.min(start + MAX_CHAPTERS_PER_MANIFEST_CALL - 1, max);
      contexts.push({
        languageCode: sourceLanguageCode,
        bookCode,
        startChapter: start,
        endChapter: end,
        bibleId,
      });
    }
  }

  return contexts;
}
