import {
  PrepareOfflineBookGroup,
  PrepareOfflineChapterRow,
} from '../types/prepareOffline/types';

/** Groups chapters by book, preserving first-seen book order from the input. */
export function groupChaptersByBook(
  chapters: PrepareOfflineChapterRow[],
): PrepareOfflineBookGroup[] {
  const groups: PrepareOfflineBookGroup[] = [];
  const indexByBookId = new Map<number, number>();

  for (const chapter of chapters) {
    const existingIndex = indexByBookId.get(chapter.bookId);
    if (existingIndex === undefined) {
      indexByBookId.set(chapter.bookId, groups.length);
      groups.push({
        bookId: chapter.bookId,
        bookName: chapter.bookName,
        chapters: [chapter],
      });
    } else {
      groups[existingIndex].chapters.push(chapter);
    }
  }

  return groups;
}
