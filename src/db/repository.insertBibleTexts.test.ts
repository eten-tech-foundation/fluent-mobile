import { setDatabase } from './db';
import { insertBibleTexts } from './repository';

type BibleTextRow = {
  id: number;
  bible_id: number;
  book_id: number;
  chapter_number: number;
  verse_number: number;
  text: string;
};

type RecordingRow = {
  id: string;
  bible_text_id: number;
};

function createBibleTextsTestDb(seed?: {
  texts?: BibleTextRow[];
  recordings?: RecordingRow[];
}) {
  const texts: BibleTextRow[] = [...(seed?.texts ?? [])];
  const recordings: RecordingRow[] = [...(seed?.recordings ?? [])];

  const execute = async (query: string, params: unknown[] = []) => {
    const sql = query.replace(/\s+/g, ' ').trim();

    if (
      sql.startsWith(
        'SELECT id FROM bible_texts WHERE bible_id = ? AND book_id = ?',
      )
    ) {
      const [bibleId, bookId, chapterNumber, verseNumber] = params as [
        number,
        number,
        number,
        number,
      ];
      const match = texts.find(
        t =>
          t.bible_id === bibleId &&
          t.book_id === bookId &&
          t.chapter_number === chapterNumber &&
          t.verse_number === verseNumber,
      );
      return { rows: match ? [{ id: match.id }] : [] };
    }

    if (
      sql ===
      'SELECT id, bible_id, book_id, chapter_number, verse_number, text FROM bible_texts WHERE id = ?'
    ) {
      const [id] = params as [number];
      const match = texts.find(t => t.id === id);
      return { rows: match ? [{ ...match }] : [] };
    }

    if (sql.startsWith('UPDATE bible_texts SET text = ? WHERE id = ?')) {
      const [text, id] = params as [string, number];
      const row = texts.find(t => t.id === id);
      if (row) row.text = text;
      return { rows: [] };
    }

    if (
      sql.startsWith('UPDATE bible_texts SET verse_number = ? WHERE id = ?')
    ) {
      const [verseNumber, id] = params as [number, number];
      const row = texts.find(t => t.id === id);
      if (row) row.verse_number = verseNumber;
      return { rows: [] };
    }

    if (
      sql.startsWith(
        'UPDATE bible_texts SET bible_id = ?, book_id = ?, chapter_number = ?, verse_number = ?, text = ? WHERE id = ?',
      )
    ) {
      const [bibleId, bookId, chapterNumber, verseNumber, text, id] =
        params as [number, number, number, number, string, number];
      const row = texts.find(t => t.id === id);
      if (row) {
        row.bible_id = bibleId;
        row.book_id = bookId;
        row.chapter_number = chapterNumber;
        row.verse_number = verseNumber;
        row.text = text;
      }
      return { rows: [] };
    }

    if (sql.startsWith('INSERT INTO bible_texts')) {
      const [id, bibleId, bookId, chapterNumber, verseNumber, text] =
        params as [number, number, number, number, number, string];
      const existing = texts.find(t => t.id === id);
      if (existing) {
        existing.bible_id = bibleId;
        existing.book_id = bookId;
        existing.chapter_number = chapterNumber;
        existing.verse_number = verseNumber;
        existing.text = text;
      } else {
        texts.push({
          id,
          bible_id: bibleId,
          book_id: bookId,
          chapter_number: chapterNumber,
          verse_number: verseNumber,
          text,
        });
      }
      return { rows: [] };
    }

    if (
      sql.startsWith(
        'UPDATE recordings SET bible_text_id = ? WHERE bible_text_id = ?',
      )
    ) {
      const [serverId, localId] = params as [number, number];
      for (const recording of recordings) {
        if (recording.bible_text_id === localId) {
          recording.bible_text_id = serverId;
        }
      }
      return { rows: [] };
    }

    if (sql.startsWith('DELETE FROM bible_texts WHERE id = ?')) {
      const [id] = params as [number];
      const index = texts.findIndex(t => t.id === id);
      if (index >= 0) texts.splice(index, 1);
      return { rows: [] };
    }

    return { rows: [] };
  };

  return {
    execute,
    transaction: async (
      fn: (tx: { execute: typeof execute }) => Promise<void>,
    ) => {
      await fn({ execute });
    },
    __texts: texts,
    __recordings: recordings,
  };
}

describe('insertBibleTexts (#469 server ids)', () => {
  it('inserts with the server id', async () => {
    const db = createBibleTextsTestDb();
    setDatabase(db as never);

    await insertBibleTexts([
      {
        bibleId: 1,
        bookId: 40,
        chapterNumber: 1,
        verses: [
          {
            id: 5001,
            bible_id: 1,
            book_id: 40,
            chapter_number: 1,
            verse_number: 1,
            text: 'Hello',
          },
        ],
      },
    ]);

    expect(db.__texts).toEqual([
      {
        id: 5001,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 1,
        text: 'Hello',
      },
    ]);
  });

  it('updates text when the server id already matches', async () => {
    const db = createBibleTextsTestDb({
      texts: [
        {
          id: 5001,
          bible_id: 1,
          book_id: 40,
          chapter_number: 1,
          verse_number: 1,
          text: 'Old',
        },
      ],
    });
    setDatabase(db as never);

    await insertBibleTexts([
      {
        bibleId: 1,
        bookId: 40,
        chapterNumber: 1,
        verses: [
          {
            id: 5001,
            bible_id: 1,
            book_id: 40,
            chapter_number: 1,
            verse_number: 1,
            text: 'New',
          },
        ],
      },
    ]);

    expect(db.__texts).toHaveLength(1);
    expect(db.__texts[0]).toEqual(
      expect.objectContaining({ id: 5001, text: 'New' }),
    );
  });

  it('remaps recordings when local id differs from server id', async () => {
    const db = createBibleTextsTestDb({
      texts: [
        {
          id: 7,
          bible_id: 1,
          book_id: 40,
          chapter_number: 1,
          verse_number: 1,
          text: 'Old',
        },
      ],
      recordings: [{ id: 'rec-1', bible_text_id: 7 }],
    });
    setDatabase(db as never);

    await insertBibleTexts([
      {
        bibleId: 1,
        bookId: 40,
        chapterNumber: 1,
        verses: [
          {
            id: 5001,
            bible_id: 1,
            book_id: 40,
            chapter_number: 1,
            verse_number: 1,
            text: 'Updated',
          },
        ],
      },
    ]);

    expect(db.__texts).toEqual([
      {
        id: 5001,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 1,
        text: 'Updated',
      },
    ]);
    expect(db.__texts.every(row => row.id > 0)).toBe(true);
    expect(db.__recordings[0]?.bible_text_id).toBe(5001);
  });

  it('parks a conflicting server-id occupant instead of clobbering it', async () => {
    const db = createBibleTextsTestDb({
      texts: [
        {
          id: 7,
          bible_id: 1,
          book_id: 40,
          chapter_number: 1,
          verse_number: 1,
          text: 'Target local row',
        },
        {
          id: 5001,
          bible_id: 1,
          book_id: 40,
          chapter_number: 1,
          verse_number: 2,
          text: 'Occupant row',
        },
      ],
      recordings: [
        { id: 'rec-target', bible_text_id: 7 },
        { id: 'rec-occupant', bible_text_id: 5001 },
      ],
    });
    setDatabase(db as never);

    await insertBibleTexts([
      {
        bibleId: 1,
        bookId: 40,
        chapterNumber: 1,
        verses: [
          {
            id: 5001,
            bible_id: 1,
            book_id: 40,
            chapter_number: 1,
            verse_number: 1,
            text: 'Target server row',
          },
        ],
      },
    ]);

    await insertBibleTexts([
      {
        bibleId: 1,
        bookId: 40,
        chapterNumber: 1,
        verses: [
          {
            id: 7002,
            bible_id: 1,
            book_id: 40,
            chapter_number: 1,
            verse_number: 2,
            text: 'Occupant server row',
          },
        ],
      },
    ]);

    expect(db.__texts).toEqual([
      {
        id: 5001,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 1,
        text: 'Target server row',
      },
      {
        id: 7002,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 2,
        text: 'Occupant server row',
      },
    ]);
    expect(db.__texts.every(row => row.id > 0 && row.verse_number > 0)).toBe(
      true,
    );
    expect(db.__recordings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rec-target', bible_text_id: 5001 }),
        expect.objectContaining({ id: 'rec-occupant', bible_text_id: 7002 }),
      ]),
    );
  });

  it('throws when verse id is missing', async () => {
    const db = createBibleTextsTestDb();
    setDatabase(db as never);

    await expect(
      insertBibleTexts([
        {
          bibleId: 1,
          bookId: 40,
          chapterNumber: 1,
          verses: [
            {
              id: 0,
              bible_id: 1,
              book_id: 40,
              chapter_number: 1,
              verse_number: 1,
              text: 'Nope',
            },
          ],
        },
      ]),
    ).rejects.toThrow(/invalid bible text id/i);
  });
});
