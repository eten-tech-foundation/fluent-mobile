import { groupChaptersByBook } from './groupChaptersByBook';
import { PrepareOfflineChapterRow } from '../types/prepareOffline/types';

function chapter(
  overrides: Partial<PrepareOfflineChapterRow> &
    Pick<PrepareOfflineChapterRow, 'id'>,
): PrepareOfflineChapterRow {
  return {
    bookId: 1,
    bookName: 'Genesis',
    chapterNumber: 1,
    assignedUserId: null,
    ...overrides,
  };
}

describe('groupChaptersByBook', () => {
  it('returns empty array for empty input', () => {
    expect(groupChaptersByBook([])).toEqual([]);
  });

  it('groups chapters by book preserving book order', () => {
    const input = [
      chapter({ id: 1, bookId: 1, bookName: 'Genesis', chapterNumber: 1 }),
      chapter({ id: 2, bookId: 1, bookName: 'Genesis', chapterNumber: 2 }),
      chapter({ id: 3, bookId: 2, bookName: 'Exodus', chapterNumber: 1 }),
    ];

    expect(groupChaptersByBook(input)).toEqual([
      {
        bookId: 1,
        bookName: 'Genesis',
        chapters: [input[0], input[1]],
      },
      {
        bookId: 2,
        bookName: 'Exodus',
        chapters: [input[2]],
      },
    ]);
  });

  it('preserves chapter order within each book', () => {
    const input = [
      chapter({ id: 10, chapterNumber: 3 }),
      chapter({ id: 11, chapterNumber: 1 }),
      chapter({ id: 12, chapterNumber: 2 }),
    ];

    const grouped = groupChaptersByBook(input);
    expect(grouped[0].chapters.map(c => c.id)).toEqual([10, 11, 12]);
  });
});
