import type { DB, Scalar, Transaction } from '@op-engineering/op-sqlite';
import { createRealSqliteDb } from '../../test/realSqlite';
import { runMigrations } from '../migrations';
import { upsertPericopeSet } from './pericopesRepository';
import type { BundledPericopeVerse } from '../../types/pericopeSets/types';

let mockDb: DB;
jest.mock('../db', () => ({ getDatabase: () => mockDb }));

const MRK = 41;

function verses(count: number, title = 'Section'): BundledPericopeVerse[] {
  return Array.from({ length: count }, (_, i) => ({
    chapterNumber: Math.floor(i / 40) + 1,
    verseNumber: (i % 40) + 1,
    section: (i % 3) + 1,
    pericopeNumber: `p${Math.floor(i / 7)}`,
    pericopeTitle: `${title} ${Math.floor(i / 7)}`,
  }));
}

type Row = {
  pericope_set_id: number;
  book_id: number;
  chapter_number: number;
  verse_number: number;
  section: number | null;
  pericope_number: string;
  pericope_title: string | null;
};

async function rows(setId: number, bookId: number): Promise<Row[]> {
  const result = await mockDb.execute(
    `SELECT pericope_set_id, book_id, chapter_number, verse_number, section,
            pericope_number, pericope_title
     FROM pericope_verses WHERE pericope_set_id = ? AND book_id = ?
     ORDER BY chapter_number, verse_number`,
    [setId, bookId],
  );
  return (result.rows ?? []) as unknown as Row[];
}

function expected(setId: number, input: BundledPericopeVerse[]): Row[] {
  const byKey = new Map<string, Row>();
  for (const v of input) {
    byKey.set(`${v.chapterNumber}:${v.verseNumber}`, {
      pericope_set_id: setId,
      book_id: MRK,
      chapter_number: v.chapterNumber,
      verse_number: v.verseNumber,
      section: v.section,
      pericope_number: v.pericopeNumber,
      pericope_title: v.pericopeTitle,
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.chapter_number - b.chapter_number || a.verse_number - b.verse_number,
  );
}

/** Counts statements issued inside transactions. */
function countingDb(real: DB): { db: DB; statements: () => number } {
  let count = 0;
  const db = {
    ...real,
    execute: real.execute,
    close: real.close,
    transaction: (fn: (tx: Transaction) => Promise<void>) =>
      real.transaction(tx =>
        fn({
          execute: (query: string, params?: Scalar[]) => {
            count += 1;
            return tx.execute(query, params);
          },
        } as Transaction),
      ),
  } as unknown as DB;
  return { db, statements: () => count };
}

describe('upsertPericopeSet against real SQLite (#886)', () => {
  beforeEach(async () => {
    mockDb = createRealSqliteDb();
    await runMigrations(mockDb);
    await mockDb.execute(`
      INSERT INTO books(id, code, eng_display_name) VALUES (40, 'MAT', 'Matthew');
      INSERT INTO books(id, code, eng_display_name) VALUES (41, 'MRK', 'Mark');
      INSERT INTO pericope_sets(id, name) VALUES (1, 'Set one');
      INSERT INTO pericope_sets(id, name) VALUES (2, 'Set two');
    `);
  });
  afterEach(async () => {
    await mockDb.close();
  });

  it('writes exactly the input rows across several chunks', async () => {
    const input = verses(673);

    await expect(upsertPericopeSet(1, 'MRK', input)).resolves.toBe(true);

    expect(await rows(1, MRK)).toEqual(expected(1, input));
  });

  it('keeps the last value when the input repeats a verse, including across chunks', async () => {
    const input = verses(300);
    input.push({ ...input[3], pericopeTitle: 'later in same chunk' });
    input.splice(250, 0, { ...input[5], pericopeNumber: 'later chunk' });
    input.push({ ...input[5], pericopeTitle: 'last of all' });

    await upsertPericopeSet(1, 'MRK', input);

    const result = await rows(1, MRK);
    expect(result).toEqual(expected(1, input));
    expect(result).toHaveLength(300);
    expect(result[3].pericope_title).toBe('later in same chunk');
    expect(result[5].pericope_title).toBe('last of all');
  });

  it('replaces only this set and book, removing its stale verses', async () => {
    await upsertPericopeSet(1, 'MRK', verses(200, 'old'));
    await upsertPericopeSet(2, 'MRK', verses(50, 'other set'));
    await upsertPericopeSet(1, 'MAT', verses(30, 'other book'));

    const next = verses(120, 'new');
    await upsertPericopeSet(1, 'MRK', next);

    expect(await rows(1, MRK)).toEqual(expected(1, next));
    expect(await rows(2, MRK)).toHaveLength(50);
    expect((await rows(2, MRK))[0].pericope_title).toBe('other set 0');
    expect(await rows(1, 40)).toHaveLength(30);
  });

  it('rolls back the whole book and keeps the prior rows when a later chunk fails', async () => {
    const prior = verses(90, 'prior');
    await upsertPericopeSet(1, 'MRK', prior);

    const next = verses(400, 'next');
    next[300] = {
      ...next[300],
      pericopeNumber: null as unknown as string,
    };

    await expect(upsertPericopeSet(1, 'MRK', next)).rejects.toThrow();

    expect(await rows(1, MRK)).toEqual(expected(1, prior));
  });

  it('reports nothing written for a book that is not synced locally', async () => {
    await expect(upsertPericopeSet(1, 'LUK', verses(10))).resolves.toBe(false);
    await expect(upsertPericopeSet(1, 'MRK', [])).resolves.toBe(false);

    const all = await mockDb.execute(
      'SELECT COUNT(*) AS n FROM pericope_verses',
    );
    expect(Number(all.rows?.[0]?.n)).toBe(0);
  });

  it('issues statements per chunk, not per verse', async () => {
    const counting = countingDb(mockDb);
    const real = mockDb;
    mockDb = counting.db;
    try {
      await upsertPericopeSet(1, 'MRK', verses(300));
      const small = counting.statements();
      await upsertPericopeSet(1, 'MRK', verses(1000));
      const large = counting.statements() - small;

      expect(small).toBeLessThanOrEqual(1 + Math.ceil(300 / 100));
      expect(large).toBeLessThanOrEqual(1 + Math.ceil(1000 / 100));
      expect(large).toBeGreaterThan(small);
    } finally {
      mockDb = real;
    }
    expect(await rows(1, MRK)).toEqual(expected(1, verses(1000)));
  });
});
