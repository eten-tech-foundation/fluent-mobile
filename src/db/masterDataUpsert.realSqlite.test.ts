jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

import type { Scalar, Transaction } from '@op-engineering/op-sqlite';
import { setDatabase } from './db';
import { runMigrations } from './migrations';
import {
  insertMasterData,
  insertProjects,
  upsertProjectUnits,
} from './repository';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';
import type { Bible, Book, Language, Project } from '../types/db/types';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

type Db = ReturnType<typeof createRealSqliteDb>;

const language: Language = {
  id: 1,
  langName: 'Gujarati',
  langNameLocalized: 'ગુજરાતી',
  langCode: 'guj',
  scriptDirection: 'ltr',
};
const book: Book = { id: 1, code: 'GEN', eng_display_name: 'Genesis' };
const bible: Bible = { id: 1, languageId: 1, name: 'GUJ', abbreviation: 'G' };
const project: Project = {
  id: 2,
  name: 'Gujarati OT',
  sourceLanguageId: 1,
  targetLanguageId: 1,
  target_language_name: 'Gujarati',
  isActive: true,
  status: 'active',
  updatedAt: '2026-11-05T20:25:24Z',
  metadata: { a: 1 },
  pericopeSetId: null,
};
const unit = { id: 3, projectId: 2, name: 'Genesis' };

async function changes(db: Db) {
  const result = await db.execute('SELECT total_changes() AS n');
  return Number(result.rows?.[0]?.n);
}

describeReal('master data pull (real SQLite)', () => {
  let db: Db;

  async function pull(
    next: {
      language?: Language;
      book?: Book;
      bible?: Bible;
      project?: Project;
      unit?: typeof unit;
    } = {},
  ) {
    const before = await changes(db);
    await insertMasterData(
      [next.language ?? language],
      [next.book ?? book],
      [next.bible ?? bible],
    );
    await insertProjects([next.project ?? project]);
    await upsertProjectUnits([next.unit ?? unit]);
    return (await changes(db)) - before;
  }

  async function one(sql: string) {
    return (await db.execute(sql)).rows?.[0] as Record<string, unknown>;
  }

  beforeEach(async () => {
    db = createRealSqliteDb();
    setDatabase(db);
    await runMigrations(db);
    await pull();
  });

  afterEach(() => {
    db.close();
  });

  it('writes nothing when the server sends what is stored', async () => {
    expect(await pull()).toBe(0);
  });

  it('persists a renamed language', async () => {
    expect(
      await pull({ language: { ...language, langNameLocalized: 'Gujarātī' } }),
    ).toBe(1);
    expect(
      (await one('SELECT lang_name_localized FROM languages WHERE id = 1'))
        .lang_name_localized,
    ).toBe('Gujarātī');
  });

  it('persists a cleared language code', async () => {
    expect(await pull({ language: { ...language, langCode: undefined } })).toBe(
      1,
    );
    expect(
      (await one('SELECT lang_code_iso_639_3 FROM languages WHERE id = 1'))
        .lang_code_iso_639_3,
    ).toBeNull();
  });

  it('persists a renamed book', async () => {
    expect(
      await pull({ book: { ...book, eng_display_name: 'Bereshit' } }),
    ).toBe(1);
    expect(
      (await one('SELECT eng_display_name FROM books WHERE id = 1'))
        .eng_display_name,
    ).toBe('Bereshit');
  });

  it('persists a changed bible abbreviation', async () => {
    expect(await pull({ bible: { ...bible, abbreviation: 'GU' } })).toBe(1);
    expect(
      (await one('SELECT abbreviation FROM bibles WHERE id = 1')).abbreviation,
    ).toBe('GU');
  });

  it.each<[string, Partial<Project>, string, unknown]>([
    ['name', { name: 'Renamed' }, 'name', 'Renamed'],
    ['status', { status: 'complete' }, 'status', 'complete'],
    ['active flag', { isActive: false }, 'is_active', 0],
    ['metadata', { metadata: { a: 2 } }, 'metadata', '{"a":2}'],
    ['pericope set', { pericopeSetId: 9 }, 'pericope_set_id', 9],
  ])('persists a changed project %s', async (_, change, column, stored) => {
    expect(await pull({ project: { ...project, ...change } })).toBe(1);
    expect(
      (await one(`SELECT ${column} FROM projects WHERE id = 2`))[column],
    ).toBe(stored);
  });

  it('persists a renamed unit', async () => {
    expect(await pull({ unit: { ...unit, name: 'Gen' } })).toBe(1);
    expect(
      (await one('SELECT name FROM project_units WHERE id = 3')).name,
    ).toBe('Gen');
  });
});

const catalogueLanguages = (count: number, from = 100): Language[] =>
  Array.from({ length: count }, (_, i) => ({
    id: from + i,
    langName: `Language ${from + i}`,
    langNameLocalized: i % 3 === 0 ? undefined : `L${from + i}`,
    langCode: i % 5 === 0 ? undefined : `l${i}`,
    scriptDirection: i % 7 === 0 ? 'rtl' : 'ltr',
  }));

const catalogueBibles = (count: number, from = 100): Bible[] =>
  Array.from({ length: count }, (_, i) => ({
    id: from + i,
    languageId: from + (i % 50),
    name: `Bible ${from + i}`,
    abbreviation: `B${from + i}`,
  }));

/** The pre-batching per-row statements, as the reference result. */
async function perRowMasterData(
  db: Db,
  languages: Language[],
  books: Book[],
  bibles: Bible[],
) {
  await db.transaction(async tx => {
    for (const lang of languages) {
      const values = [
        lang.langName,
        lang.langNameLocalized ?? null,
        lang.langCode ?? null,
        lang.scriptDirection ?? 'ltr',
      ];
      await tx.execute(
        `INSERT OR IGNORE INTO languages
        (id, lang_name, lang_name_localized, lang_code_iso_639_3, script_direction)
        VALUES (?, ?, ?, ?, ?)`,
        [lang.id, ...values],
      );
      await tx.execute(
        `UPDATE languages SET
          lang_name = ?, lang_name_localized = ?,
          lang_code_iso_639_3 = ?, script_direction = ?
        WHERE id = ? AND (lang_name IS NOT ? OR lang_name_localized IS NOT ?
          OR lang_code_iso_639_3 IS NOT ? OR script_direction IS NOT ?)`,
        [...values, lang.id, ...values],
      );
    }
    for (const b of books) {
      if (!b.eng_display_name) continue;
      await tx.execute(
        `INSERT OR IGNORE INTO books (id, code, eng_display_name) VALUES (?, ?, ?)`,
        [b.id, b.code, b.eng_display_name],
      );
      await tx.execute(
        `UPDATE books SET code = ?, eng_display_name = ?
        WHERE id = ? AND (code IS NOT ? OR eng_display_name IS NOT ?)`,
        [b.code, b.eng_display_name, b.id, b.code, b.eng_display_name],
      );
    }
    for (const b of bibles) {
      if (!b.name || !b.abbreviation) continue;
      const values = [b.languageId, b.name, b.abbreviation];
      await tx.execute(
        `INSERT OR IGNORE INTO bibles (id, language_id, name, abbreviation) VALUES (?, ?, ?, ?)`,
        [b.id, ...values],
      );
      await tx.execute(
        `UPDATE bibles SET language_id = ?, name = ?, abbreviation = ?
        WHERE id = ? AND (language_id IS NOT ? OR name IS NOT ? OR abbreviation IS NOT ?)`,
        [...values, b.id, ...values],
      );
    }
  });
}

describeReal('master data pull statement count (real SQLite)', () => {
  let db: Db;
  let statements = 0;

  async function dump(target: Db) {
    const rows = async (sql: string) => (await target.execute(sql)).rows;
    return {
      languages: await rows('SELECT * FROM languages ORDER BY id'),
      books: await rows('SELECT * FROM books ORDER BY id'),
      bibles: await rows('SELECT * FROM bibles ORDER BY id'),
    };
  }

  beforeEach(async () => {
    db = createRealSqliteDb();
    await runMigrations(db);
    statements = 0;
    setDatabase({
      ...db,
      transaction: (fn: (tx: Transaction) => Promise<void>) =>
        db.transaction(tx =>
          fn({
            ...tx,
            execute: (query: string, params?: Scalar[]) => {
              statements += 1;
              return tx.execute(query, params);
            },
          }),
        ),
    } as Db);
  });

  afterEach(() => {
    db.close();
  });

  it('writes a cold catalogue in chunked statements, not two per row', async () => {
    await insertMasterData(
      catalogueLanguages(1000),
      [book],
      catalogueBibles(300),
    );
    expect(statements).toBeLessThanOrEqual(40);
    expect(
      Number((await one(db, 'SELECT COUNT(*) AS n FROM languages')).n),
    ).toBe(1000);
    expect(Number((await one(db, 'SELECT COUNT(*) AS n FROM bibles')).n)).toBe(
      300,
    );
  });

  it('re-pulls an unchanged catalogue with reads only', async () => {
    await insertMasterData(
      catalogueLanguages(1000),
      [book],
      catalogueBibles(300),
    );
    statements = 0;
    const before = Number((await one(db, 'SELECT total_changes() AS n')).n);
    await insertMasterData(
      catalogueLanguages(1000),
      [book],
      catalogueBibles(300),
    );
    expect(statements).toBeLessThanOrEqual(20);
    expect(Number((await one(db, 'SELECT total_changes() AS n')).n)).toBe(
      before,
    );
  });

  it('stores exactly what the per-row statements store for a mixed pull', async () => {
    const seed = catalogueLanguages(250);
    const seedBibles = catalogueBibles(120);
    const languages: Language[] = [
      ...catalogueLanguages(250).map((lang, i) =>
        i % 4 === 0 ? { ...lang, langNameLocalized: `renamed ${i}` } : lang,
      ),
      ...catalogueLanguages(150, 350),
      { id: 360, langName: 'Duplicate last wins', scriptDirection: 'rtl' },
      { id: 900, langName: null as unknown as string },
      { id: 901, langName: 'Kept', langCode: 'kpt' },
    ];
    const bibles: Bible[] = [
      ...catalogueBibles(120).map((b, i) =>
        i % 5 === 0 ? { ...b, abbreviation: `X${i}` } : b,
      ),
      ...catalogueBibles(60, 400),
      { id: 410, languageId: 101, name: 'Duplicate bible', abbreviation: 'DB' },
      { id: 999, languageId: 100, name: '', abbreviation: 'skip' },
    ];

    const reference = createRealSqliteDb();
    await runMigrations(reference);
    await perRowMasterData(reference, seed, [book], seedBibles);
    await perRowMasterData(reference, languages, [book], bibles);

    await insertMasterData(seed, [book], seedBibles);
    await insertMasterData(languages, [book], bibles);

    expect(await dump(db)).toEqual(await dump(reference));
    reference.close();
  });
});

async function one(target: Db, sql: string) {
  return (await target.execute(sql)).rows?.[0] as Record<string, unknown>;
}
