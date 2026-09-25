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
    // Build contiguous runs from the selected chapter numbers before
    // chunking, so a gap in selection (e.g. chapters 1 and 40) never
    // produces a manifest request spanning the unselected chapters between
    // them (#504 review).
    const sorted = [...new Set(chapterNumbers)].sort((a, b) => a - b);

    for (let i = 0; i < sorted.length; ) {
      let last = i;
      while (
        last + 1 < sorted.length &&
        sorted[last + 1] === sorted[last] + 1
      ) {
        last++;
      }

      for (
        let start = sorted[i];
        start <= sorted[last];
        start += MAX_CHAPTERS_PER_MANIFEST_CALL
      ) {
        contexts.push({
          languageCode: sourceLanguageCode,
          bookCode,
          bookId,
          startChapter: start,
          endChapter: Math.min(
            start + MAX_CHAPTERS_PER_MANIFEST_CALL - 1,
            sorted[last],
          ),
          bibleId,
        });
      }

      i = last + 1;
    }
  }

  return contexts;
}
