import { PrepareOfflineChapterRow } from '../types/prepareOffline/types';

export interface PrepareOfflineManifestContext {
  languageCode: string;
  bookCode: string;
  bookId: number;
  startChapter: number;
  endChapter: number;
  bibleId: number;
}
const MAX_CHAPTERS_PER_MANIFEST_CALL = 20;

export function buildManifestContexts(
  chapters: PrepareOfflineChapterRow[],
  selectedIds: Set<number>,
  sourceLanguageCode: string,
): PrepareOfflineManifestContext[] {
  const selectedByBook = new Map<
    string,
    { chapterNumbers: number[]; bibleId: number; bookId: number }
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
      if (entry.bookId !== chapter.bookId) {
        throw new Error(
          `Inconsistent bookId within book ${chapter.bookCode}: ${entry.bookId} vs ${chapter.bookId}`,
        );
      }
    } else {
      selectedByBook.set(chapter.bookCode, {
        chapterNumbers: [chapter.chapterNumber],
        bibleId: chapter.bibleId,
        bookId: chapter.bookId,
      });
    }
  }

  const contexts: PrepareOfflineManifestContext[] = [];

  for (const [
    bookCode,
    { chapterNumbers, bibleId, bookId },
  ] of selectedByBook) {
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
        bookId,
        startChapter: start,
        endChapter: end,
        bibleId,
      });
    }
  }

  return contexts;
}
