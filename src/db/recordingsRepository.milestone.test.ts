import type { DB } from '@op-engineering/op-sqlite';
import { createRealSqliteDb } from '../test/realSqlite';
import {
  getAllTakesForVerse,
  verseHasMultipleRecorders,
} from './recordingsRepository';

let mockDb: DB;
jest.mock('./db', () => ({ getDatabase: () => mockDb }));
jest.mock('../services/storage', () => ({ getActiveUserId: () => '1' }));

describe('All Takes milestone scope with real SQLite', () => {
  beforeEach(async () => {
    mockDb = createRealSqliteDb();
    await mockDb.execute(`
      CREATE TABLE recordings (
        id TEXT, bible_text_id INTEGER, recorded_by_user_id INTEGER,
        project_unit_id INTEGER, granularity TEXT DEFAULT 'verse',
        start_chapter INTEGER, start_verse INTEGER, end_chapter INTEGER,
        end_verse INTEGER, take_number INTEGER DEFAULT 1, created_at TEXT
      );
      CREATE TABLE users (id INTEGER, first_name TEXT, last_name TEXT, username TEXT, email TEXT);
      CREATE TABLE bible_texts (id INTEGER, bible_id INTEGER, book_id INTEGER, chapter_number INTEGER, verse_number INTEGER);
      INSERT INTO bible_texts VALUES (42, 1, 1, 1, 1), (43, 1, 1, 1, 2), (44, 2, 1, 1, 2);
    `);
  });

  afterEach(async () => {
    await mockDb.close();
  });

  async function take(
    unit: number | null,
    user = 2,
    verse = 42,
    pericope = false,
  ) {
    await mockDb.execute(
      `INSERT INTO recordings (id, bible_text_id, recorded_by_user_id, project_unit_id, granularity, start_chapter, start_verse, end_chapter, end_verse)
       VALUES (?, ?, ?, ?, ?, 1, 1, 1, 2)`,
      [
        `take-${unit}-${user}-${verse}`,
        verse,
        user,
        unit,
        pericope ? 'pericope' : 'verse',
      ],
    );
  }

  it('does not expose another milestone on the same verse', async () => {
    await take(579);
    await expect(
      verseHasMultipleRecorders(42, undefined, undefined, 580),
    ).resolves.toBe(false);
    await expect(getAllTakesForVerse(42, undefined, 580)).resolves.toEqual([]);
  });

  it('exposes another user in the same milestone, but not the active user alone', async () => {
    await take(580, 1);
    await expect(
      verseHasMultipleRecorders(42, undefined, undefined, 580),
    ).resolves.toBe(false);
    await take(580);
    await expect(
      verseHasMultipleRecorders(42, undefined, undefined, 580),
    ).resolves.toBe(true);
  });

  it('preserves legacy NULL-unit visibility like the All Takes list', async () => {
    await take(null);
    await expect(
      verseHasMultipleRecorders(42, undefined, undefined, 580),
    ).resolves.toBe(true);
    expect(await getAllTakesForVerse(42, undefined, 580)).toHaveLength(1);
  });

  it('scopes covering pericope takes by milestone and bible', async () => {
    const view = { chapterNumber: 1, verseNumber: 2 };
    await take(579, 2, 42, true);
    await take(580, 2, 44, true);
    await expect(
      verseHasMultipleRecorders(43, undefined, view, 580),
    ).resolves.toBe(false);
    await take(580, 2, 42, true);
    await expect(
      verseHasMultipleRecorders(43, undefined, view, 580),
    ).resolves.toBe(true);
    expect(await getAllTakesForVerse(43, view, 580)).toHaveLength(1);
  });

  it.each([undefined, null, NaN])(
    'preserves unscoped callers when unit is %s',
    async unit => {
      await take(579);
      await expect(
        verseHasMultipleRecorders(42, undefined, undefined, unit),
      ).resolves.toBe(true);
    },
  );
});
