import { PrepareOfflineChapterRow } from '../types/prepareOffline/types';

export interface PrepareOfflineManifestContext {
  languageCode: string;
  bookCode: string;
  startChapter: number;
  endChapter: number;
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
  const selectedByBook = new Map<string, number[]>();

  for (const chapter of chapters) {
    if (!selectedIds.has(chapter.id)) continue;
    const list = selectedByBook.get(chapter.bookCode) ?? [];
    list.push(chapter.chapterNumber);
    selectedByBook.set(chapter.bookCode, list);
  }

  const contexts: PrepareOfflineManifestContext[] = [];

  for (const [bookCode, chapterNumbers] of selectedByBook) {
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
      });
    }
  }

  return contexts;
}
