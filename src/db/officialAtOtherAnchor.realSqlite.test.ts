import type { DB } from '@op-engineering/op-sqlite';
import { createRealSqliteDb } from '../test/realSqlite';
import { runMigrations } from './migrations';
import { findOfficialAtOtherAnchor } from './recordingsRepository';

let mockDb: DB;
jest.mock('./db', () => ({ getDatabase: () => mockDb }));
jest.mock('../services/storage', () => ({ getActiveUserId: () => '7' }));
jest.mock('../services/recordingDataEvents', () => ({
  emitRecordingDataChanged: jest.fn(),
}));

type Take = {
  id: string;
  /** bible_texts id: 100 + chapter * 10 + verse in Matthew; 913 Mark; 813 another bible. */
  anchor: number;
  granularity?: 'verse' | 'pericope';
  range: [number, number, number, number];
  canonical?: boolean;
  unit?: number | null;
};

async function insert({
  id,
  anchor,
  granularity = 'verse',
  range: [sc, sv, ec, ev],
  canonical = false,
  unit = 12,
}: Take) {
  await mockDb.execute(
    `INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
      local_file_path, is_selected, is_canonical, sync_status, granularity,
      start_chapter, start_verse, end_chapter, end_verse, created_at, updated_at)
     VALUES (?, ?, 7, ?, ?, 1, ?, 'uploaded', ?, ?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
    [
      id,
      anchor,
      unit,
      `file:///${id}.m4a`,
      canonical ? 1 : 0,
      granularity,
      sc,
      sv,
      ec,
      ev,
    ],
  );
}

describe('findOfficialAtOtherAnchor against real SQLite (#896)', () => {
  beforeEach(async () => {
    mockDb = createRealSqliteDb();
    await runMigrations(mockDb);
    const verses = [
      [1, 1],
      [1, 3],
      [1, 5],
      [1, 30],
      [2, 1],
      [2, 3],
    ]
      .map(
        ([c, v]) =>
          `(${100 + c * 10 + v}, 1, 40, ${c}, ${v}, 'Matthew ${c}:${v}')`,
      )
      .join(', ');
    await mockDb.execute(`
      INSERT INTO users(id, email) VALUES (7, 'fixture@example.test');
      INSERT INTO languages(id, lang_name, script_direction) VALUES (1, 'Fixture', 'ltr');
      INSERT INTO books(id, code, eng_display_name) VALUES (40, 'MAT', 'Matthew'), (41, 'MRK', 'Mark');
      INSERT INTO bibles(id, language_id, name, abbreviation)
        VALUES (1, 1, 'Fixture', 'FIX'), (2, 1, 'Other', 'OTH');
      INSERT INTO projects(id, name, source_language_id, target_language_id, is_active, status, updated_at)
        VALUES (1, 'Fixture', 1, 1, 1, 'not_assigned', '2026-01-01');
      INSERT INTO project_units(id, project_id, status, name)
        VALUES (12, 1, 'not_started', ''), (13, 1, 'not_started', '');
      INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
        VALUES ${verses}, (913, 1, 41, 1, 3, 'Mark 1:3'),
          (813, 2, 40, 1, 3, 'Other Matthew 1:3');
    `);
  });
  afterEach(async () => {
    await mockDb.close();
  });

  it('finds the official passage over a verse being chosen', async () => {
    await insert({
      id: 'passage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
      canonical: true,
    });
    await insert({ id: 'verse3', anchor: 113, range: [1, 3, 1, 3] });

    await expect(findOfficialAtOtherAnchor('verse3')).resolves.toMatchObject({
      id: 'passage',
    });
  });

  it('finds an official verse under a passage being chosen', async () => {
    await insert({
      id: 'verse5',
      anchor: 115,
      range: [1, 5, 1, 5],
      canonical: true,
    });
    await insert({
      id: 'passage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
    });

    await expect(findOfficialAtOtherAnchor('passage')).resolves.toMatchObject({
      id: 'verse5',
    });
  });

  it('finds overlaps across a chapter boundary', async () => {
    await insert({
      id: 'verse2_1',
      anchor: 121,
      range: [2, 1, 2, 1],
      canonical: true,
    });
    await insert({
      id: 'spanning',
      anchor: 140,
      granularity: 'pericope',
      range: [1, 30, 2, 3],
    });

    await expect(findOfficialAtOtherAnchor('spanning')).resolves.toMatchObject({
      id: 'verse2_1',
    });
  });

  it('reads a pre-range verse row as its own verse', async () => {
    await insert({
      id: 'legacy3',
      anchor: 113,
      range: [0, 0, 0, 0],
      canonical: true,
    });
    await insert({
      id: 'passage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
    });

    await expect(findOfficialAtOtherAnchor('passage')).resolves.toMatchObject({
      id: 'legacy3',
    });
  });

  it('reads a pre-range target as its own verse', async () => {
    await insert({
      id: 'passage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
      canonical: true,
    });
    await insert({ id: 'legacy3', anchor: 113, range: [0, 0, 0, 0] });

    await expect(findOfficialAtOtherAnchor('legacy3')).resolves.toMatchObject({
      id: 'passage',
    });
  });

  it('treats a one-verse passage and a verse take as different anchors', async () => {
    await insert({
      id: 'verse3',
      anchor: 113,
      range: [1, 3, 1, 3],
      canonical: true,
    });
    await insert({
      id: 'onePassage',
      anchor: 113,
      granularity: 'pericope',
      range: [1, 3, 1, 3],
    });

    await expect(
      findOfficialAtOtherAnchor('onePassage'),
    ).resolves.toMatchObject({ id: 'verse3' });
  });

  it('matches an official take saved without a unit', async () => {
    await insert({
      id: 'noUnit3',
      anchor: 113,
      range: [1, 3, 1, 3],
      canonical: true,
      unit: null,
    });
    await insert({
      id: 'passage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
    });

    await expect(findOfficialAtOtherAnchor('passage')).resolves.toMatchObject({
      id: 'noUnit3',
    });
  });

  it('allows another verse take at the same verse', async () => {
    await insert({
      id: 'official3',
      anchor: 113,
      range: [1, 3, 1, 3],
      canonical: true,
    });
    await insert({ id: 'other3', anchor: 113, range: [1, 3, 1, 3] });

    await expect(findOfficialAtOtherAnchor('other3')).resolves.toBeNull();
  });

  it('allows another passage take over the same verses', async () => {
    await insert({
      id: 'officialPassage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
      canonical: true,
    });
    await insert({
      id: 'otherPassage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
    });

    await expect(findOfficialAtOtherAnchor('otherPassage')).resolves.toBeNull();
  });

  it('allows a take outside the official passage', async () => {
    await insert({
      id: 'officialPassage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
      canonical: true,
    });
    await insert({ id: 'verse2_3', anchor: 123, range: [2, 3, 2, 3] });

    await expect(findOfficialAtOtherAnchor('verse2_3')).resolves.toBeNull();
  });

  it('ignores another bible, another book and another unit', async () => {
    await insert({
      id: 'otherBibleVerse',
      anchor: 813,
      range: [1, 3, 1, 3],
      canonical: true,
    });
    await insert({
      id: 'markVerse',
      anchor: 913,
      range: [1, 3, 1, 3],
      canonical: true,
    });
    await insert({
      id: 'otherUnit',
      anchor: 113,
      range: [1, 3, 1, 3],
      canonical: true,
      unit: 13,
    });
    await insert({
      id: 'passage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
    });

    await expect(findOfficialAtOtherAnchor('passage')).resolves.toBeNull();
  });

  it('is null for a take already official, or one that is gone', async () => {
    await insert({
      id: 'verse3',
      anchor: 113,
      range: [1, 3, 1, 3],
      canonical: true,
    });
    await insert({
      id: 'passage',
      anchor: 111,
      granularity: 'pericope',
      range: [1, 1, 1, 5],
      canonical: true,
    });

    await expect(findOfficialAtOtherAnchor('passage')).resolves.toBeNull();
    await expect(findOfficialAtOtherAnchor('missing')).resolves.toBeNull();
  });
});
