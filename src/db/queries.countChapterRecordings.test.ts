jest.mock('../services/storage', () => ({
  getActiveUserId: () => '1',
  getUserIdSync: () => '1',
}));

import { setDatabase } from './db';
import { countChapterRecordings } from './queries';

type BibleTextRow = {
  id: number;
  bible_id: number;
  book_id: number;
  chapter_number: number;
  verse_number: number;
};

type RecordingRow = {
  id: string;
  bible_text_id: number;
};

function createCountTestDb(
  bibleTexts: BibleTextRow[],
  recordings: RecordingRow[],
) {
  return {
    execute: async (query: string, params: unknown[] = []) => {
      const sql = query.replace(/\s+/g, ' ').trim();
      if (sql.includes('SELECT COUNT(*) as count')) {
        const [bibleId, bookId, chapterNumber] = params as [
          number,
          number,
          number,
        ];
        const textIds = new Set(
          bibleTexts
            .filter(
              bt =>
                bt.bible_id === bibleId &&
                bt.book_id === bookId &&
                bt.chapter_number === chapterNumber,
            )
            .map(bt => bt.id),
        );
        const count = recordings.filter(r =>
          textIds.has(r.bible_text_id),
        ).length;
        return { rows: [{ count }] };
      }
      return { rows: [] };
    },
  };
}

describe('countChapterRecordings', () => {
  const bibleTexts: BibleTextRow[] = [
    {
      id: 100,
      bible_id: 1,
      book_id: 1,
      chapter_number: 14,
      verse_number: 1,
    },
    {
      id: 101,
      bible_id: 1,
      book_id: 1,
      chapter_number: 14,
      verse_number: 2,
    },
  ];

  beforeEach(() => {
    setDatabase(createCountTestDb(bibleTexts, []) as never);
  });

  it('returns 1 when this insert is the chapter first recording', async () => {
    setDatabase(
      createCountTestDb(bibleTexts, [
        { id: 'rec_1', bible_text_id: 100 },
      ]) as never,
    );
    await expect(countChapterRecordings(1, 1, 14)).resolves.toBe(1);
  });

  it('returns >1 when the chapter already has recordings from another user', async () => {
    setDatabase(
      createCountTestDb(bibleTexts, [
        { id: 'rec_1', bible_text_id: 100 },
        { id: 'rec_2', bible_text_id: 101 },
      ]) as never,
    );
    await expect(countChapterRecordings(1, 1, 14)).resolves.toBe(2);
  });
});
