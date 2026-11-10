import type { DB, Scalar, Transaction } from '@op-engineering/op-sqlite';
import { setDatabase } from './db';
import { runMigrations } from './migrations';
import { insertBibleTexts } from './repository';
import { createRealSqliteDb } from '../test/realSqlite';
import type * as DBTypes from '../types/db/types';

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

    if (sql.startsWith('SELECT id FROM bible_texts WHERE id IN (')) {
      const ids = new Set(params as number[]);
      return {
        rows: texts.filter(t => ids.has(t.id)).map(t => ({ id: t.id })),
      };
    }

    if (
      sql.startsWith(
        'SELECT id FROM bible_texts WHERE (bible_id, book_id, chapter_number, verse_number) IN (',
      )
    ) {
      const keys = new Set<string>();
      for (let i = 0; i < params.length; i += 4) {
        keys.add(params.slice(i, i + 4).join(':'));
      }
      return {
        rows: texts
          .filter(t =>
            keys.has(
              [t.bible_id, t.book_id, t.chapter_number, t.verse_number].join(
                ':',
              ),
            ),
          )
          .map(t => ({ id: t.id })),
      };
    }

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

describe('insertBibleTexts against real SQLite (#886)', () => {
  let db: DB;
  let statements = 0;

  function chapter(
    chapterNumber: number,
    verses: [id: number, verse: number, text?: string][],
    bookId = 40,
  ): DBTypes.BibleText {
    return {
      bibleId: 1,
      bookId,
      chapterNumber,
      verses: verses.map(([id, verse, text]) => ({
        id,
        bible_id: 1,
        book_id: bookId,
        chapter_number: chapterNumber,
        verse_number: verse,
        text: text ?? `v${verse}`,
      })),
    };
  }

  function cleanChapter(chapterNumber: number, count: number, firstId: number) {
    return chapter(
      chapterNumber,
      Array.from(
        { length: count },
        (_, i) => [firstId + i, i + 1] as const,
      ).map(([id, verse]) => [id, verse] as [number, number]),
    );
  }

  async function texts() {
    const result = await db.execute(
      `SELECT id, bible_id, book_id, chapter_number, verse_number, text
       FROM bible_texts ORDER BY id`,
    );
    return result.rows ?? [];
  }

  async function recordingTarget(id: string) {
    const result = await db.execute(
      'SELECT bible_text_id FROM recordings WHERE id = ?',
      [id],
    );
    return Number(result.rows?.[0]?.bible_text_id);
  }

  async function seedRecording(id: string, bibleTextId: number) {
    await db.execute(
      `INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
        local_file_path, is_selected, sync_status, start_chapter, start_verse,
        end_chapter, end_verse, created_at, updated_at)
       VALUES (?, ?, 7, 12, 'file:///r.m4a', 0, 'pending', 1, 1, 1, 1, '2026-01-01', '2026-01-01')`,
      [id, bibleTextId],
    );
  }

  beforeEach(async () => {
    const real = createRealSqliteDb();
    await runMigrations(real);
    await real.execute(`
      INSERT INTO users(id, email) VALUES (7, 'fixture@example.test');
      INSERT INTO languages(id, lang_name, script_direction) VALUES (1, 'Fixture', 'ltr');
      INSERT INTO books(id, code, eng_display_name) VALUES (40, 'MAT', 'Matthew');
      INSERT INTO bibles(id, language_id, name, abbreviation) VALUES (1, 1, 'Fixture', 'FIX');
      INSERT INTO projects(id, name, source_language_id, target_language_id, is_active, status, updated_at)
        VALUES (1, 'Fixture', 1, 1, 1, 'not_assigned', '2026-01-01');
      INSERT INTO project_units(id, project_id, status, name) VALUES (12, 1, 'not_started', '');
    `);
    statements = 0;
    db = {
      ...real,
      execute: real.execute,
      close: real.close,
      transaction: (fn: (tx: Transaction) => Promise<void>) =>
        real.transaction(tx =>
          fn({
            execute: (query: string, params?: Scalar[]) => {
              statements += 1;
              return tx.execute(query, params);
            },
          } as Transaction),
        ),
    } as unknown as DB;
    setDatabase(db);
  });
  afterEach(async () => {
    await db.close();
  });

  it('writes a clean multi-chapter batch exactly, with statements per chunk', async () => {
    const input = [cleanChapter(1, 130, 1000), cleanChapter(2, 120, 2000)];

    await insertBibleTexts(input);

    const expected = input
      .flatMap(c => c.verses)
      .map(v => ({ ...v }))
      .sort((a, b) => a.id - b.id);
    expect(await texts()).toEqual(expected);
    expect(statements).toBeLessThanOrEqual(3 * Math.ceil(250 / 100));
  });

  it('updates text in place when the server id already owns the verse', async () => {
    await insertBibleTexts([
      chapter(1, [
        [5001, 1, 'Old'],
        [5002, 2, 'Old'],
      ]),
    ]);
    await seedRecording('rec', 5001);

    await insertBibleTexts([
      chapter(1, [
        [5001, 1, 'New'],
        [5002, 2, 'New 2'],
        [5003, 3, 'Third'],
      ]),
    ]);

    expect(await texts()).toEqual([
      {
        id: 5001,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 1,
        text: 'New',
      },
      {
        id: 5002,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 2,
        text: 'New 2',
      },
      {
        id: 5003,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 3,
        text: 'Third',
      },
    ]);
    expect(await recordingTarget('rec')).toBe(5001);
  });

  it('remaps recordings when a verse arrives with a different server id, inside an otherwise clean chunk', async () => {
    await db.execute(
      `INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
       VALUES (7, 1, 40, 1, 5, 'local')`,
    );
    await seedRecording('rec-local', 7);

    const input = cleanChapter(1, 40, 3000);
    await insertBibleTexts([input]);

    const rows = await texts();
    expect(rows).toHaveLength(40);
    expect(rows.find(r => Number(r.verse_number) === 5)?.id).toBe(3004);
    expect(rows.every(r => Number(r.id) >= 3000)).toBe(true);
    expect(await recordingTarget('rec-local')).toBe(3004);
  });

  it('parks a server-id occupant and later remaps its recording', async () => {
    await db.execute(`
      INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
        VALUES (7, 1, 40, 1, 1, 'target local');
      INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
        VALUES (5001, 1, 40, 1, 2, 'occupant');
    `);
    await seedRecording('rec-target', 7);
    await seedRecording('rec-occupant', 5001);

    await insertBibleTexts([chapter(1, [[5001, 1, 'target server']])]);
    await insertBibleTexts([chapter(1, [[7002, 2, 'occupant server']])]);

    expect(await texts()).toEqual([
      {
        id: 5001,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 1,
        text: 'target server',
      },
      {
        id: 7002,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 2,
        text: 'occupant server',
      },
    ]);
    expect(await recordingTarget('rec-target')).toBe(5001);
    expect(await recordingTarget('rec-occupant')).toBe(7002);
  });

  it('handles server ids that swap two existing verses', async () => {
    await db.execute(`
      INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
        VALUES (101, 1, 40, 1, 1, 'one');
      INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
        VALUES (102, 1, 40, 1, 2, 'two');
    `);
    await seedRecording('rec-1', 101);
    await seedRecording('rec-2', 102);

    await insertBibleTexts([
      chapter(1, [
        [102, 1, 'one'],
        [101, 2, 'two'],
      ]),
    ]);

    expect(await texts()).toEqual([
      {
        id: 101,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 2,
        text: 'two',
      },
      {
        id: 102,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 1,
        text: 'one',
      },
    ]);
    expect(await recordingTarget('rec-1')).toBe(102);
    expect(await recordingTarget('rec-2')).toBe(101);
  });

  it('keeps the last value when the input repeats a verse', async () => {
    await insertBibleTexts([
      chapter(1, [
        [6001, 1, 'first'],
        [6002, 2],
        [6001, 1, 'second'],
      ]),
    ]);

    expect(await texts()).toEqual([
      {
        id: 6001,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 1,
        text: 'second',
      },
      {
        id: 6002,
        bible_id: 1,
        book_id: 40,
        chapter_number: 1,
        verse_number: 2,
        text: 'v2',
      },
    ]);
  });

  it('rolls back every chunk when a later verse has an invalid id', async () => {
    const bad = cleanChapter(2, 50, 9000);
    bad.verses[30] = { ...bad.verses[30], id: 0 };

    await expect(
      insertBibleTexts([cleanChapter(1, 150, 8000), bad]),
    ).rejects.toThrow(/invalid bible text id/i);

    expect(await texts()).toEqual([]);
  });

  it('rolls back every chunk when a later batch fails in SQLite', async () => {
    const orphan = cleanChapter(2, 50, 9500);
    orphan.verses[10] = { ...orphan.verses[10], book_id: 999 };

    await expect(
      insertBibleTexts([cleanChapter(1, 150, 8500), orphan]),
    ).rejects.toThrow();

    expect(await texts()).toEqual([]);
  });
});
