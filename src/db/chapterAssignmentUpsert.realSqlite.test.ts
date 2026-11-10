jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

import { setDatabase } from './db';
import { runMigrations } from './migrations';
import {
  insertChapterAssignmentSyncData,
  reconcileUserChapterWork,
} from './repository';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';
import type { ChapterAssignment } from '../types/db/types';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

type Db = ReturnType<typeof createRealSqliteDb>;

const base: ChapterAssignment = {
  chapterAssignmentId: 10,
  projectUnitId: 3,
  projectId: 2,
  bibleId: 1,
  bookId: 1,
  chapterNumber: 37,
  assignedUserId: 4,
  peerCheckerId: 5,
  chapterStatus: 'draft',
  submittedTime: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-05T20:25:24Z',
  totalVerses: 36,
  completedVerses: 3,
  hasConflict: false,
};

async function seed(db: Db) {
  await runMigrations(db);
  await db.execute(
    "INSERT INTO languages (id, lang_name, script_direction) VALUES (1, 'Gujarati', 'ltr')",
  );
  await db.execute(
    "INSERT INTO books (id, code, eng_display_name) VALUES (1, 'GEN', 'Genesis'), (2, 'EXO', 'Exodus')",
  );
  await db.execute(
    "INSERT INTO bibles (id, language_id, name, abbreviation) VALUES (1, 1, 'GUJ', 'GUJ'), (2, 1, 'GUJ2', 'G2')",
  );
  await db.execute(
    "INSERT INTO projects (id, name, source_language_id, target_language_id, updated_at) VALUES (2, 'P', 1, 1, '2026-11-01')",
  );
  await db.execute(
    "INSERT INTO users (id, email) VALUES (4, 'a@x'), (5, 'b@x'), (6, 'c@x')",
  );
}

async function row(db: Db, id = 10) {
  const result = await db.execute(
    'SELECT * FROM chapter_assignments WHERE id = ?',
    [id],
  );
  return result.rows?.[0] as Record<string, unknown>;
}

/** Assignment rows a pull inserts or updates, logged by test-only triggers. */
async function writtenBy(db: Db, assignments: ChapterAssignment[]) {
  const count = async () =>
    Number(
      (await db.execute('SELECT COUNT(*) AS n FROM temp.ca_writes')).rows?.[0]
        ?.n,
    );
  const before = await count();
  await insertChapterAssignmentSyncData(assignments);
  return (await count()) - before;
}

describeReal('chapter assignment pull (real SQLite)', () => {
  let db: Db;

  beforeEach(async () => {
    db = createRealSqliteDb();
    setDatabase(db);
    await seed(db);
    await insertChapterAssignmentSyncData([base]);
    await db.execute('CREATE TEMP TABLE ca_writes (id INTEGER)');
    for (const op of ['INSERT', 'UPDATE']) {
      await db.execute(
        `CREATE TEMP TRIGGER ca_${op.toLowerCase()} AFTER ${op} ON chapter_assignments
         BEGIN INSERT INTO ca_writes VALUES (NEW.id); END`,
      );
    }
  });

  it('writes nothing to the assignment when the server sends what is stored', async () => {
    const before = await row(db);
    expect(await writtenBy(db, [base])).toBe(0);
    expect(await row(db)).toEqual(before);
  });

  it.each([
    ['assignee', { assignedUserId: 6 }, { assigned_user_id: 6 }],
    [
      'assignee removed',
      { assignedUserId: undefined },
      { assigned_user_id: null },
    ],
    ['peer checker', { peerCheckerId: 6 }, { peer_checker_id: 6 }],
    [
      'peer checker removed',
      { peerCheckerId: undefined },
      { peer_checker_id: null },
    ],
    ['stage', { chapterStatus: 'peer_check' }, { status: 'peer_check' }],
    ['progress', { completedVerses: 4 }, { completed_verses: 4 }],
    ['more verses', { totalVerses: 40 }, { total_verses: 40 }],
    [
      'submitted',
      { submittedTime: '2026-11-06T10:00:00Z' },
      { submitted_time: '2026-11-06T10:00:00Z' },
    ],
    [
      'updated_at',
      { updatedAt: '2026-11-06T10:00:00Z' },
      { updated_at: '2026-11-06T10:00:00Z' },
    ],
    ['conflict', { hasConflict: true }, { has_conflict: 1 }],
    ['bible', { bibleId: 2 }, { bible_id: 2 }],
    ['book', { bookId: 2 }, { book_id: 2 }],
    ['chapter', { chapterNumber: 38 }, { chapter_number: 38 }],
  ] as const)('persists a changed %s', async (_name, change, expected) => {
    expect(await writtenBy(db, [{ ...base, ...change }])).toBe(1);
    expect(await row(db)).toMatchObject(expected);
  });

  it('keeps more verses than the server reports, without a write', async () => {
    expect(await writtenBy(db, [{ ...base, totalVerses: 30 }])).toBe(0);
    expect((await row(db)).total_verses).toBe(36);
  });

  it("keeps a conflict when the server doesn't say, and doesn't write for it", async () => {
    await insertChapterAssignmentSyncData([{ ...base, hasConflict: true }]);
    expect(await writtenBy(db, [{ ...base, hasConflict: undefined }])).toBe(0);
    expect((await row(db)).has_conflict).toBe(1);
  });

  it('keeps a queued stage advance and writes only what else changed', async () => {
    await db.execute(
      `INSERT INTO stage_advance_queue
       (chapter_assignment_id, user_id, from_status, to_status, peer_checker_id, created_at)
       VALUES (10, 4, 'draft', 'peer_check', 6, '2026-11-06')`,
    );
    await db.execute(
      "UPDATE chapter_assignments SET status = 'peer_check', peer_checker_id = 6 WHERE id = 10",
    );

    const stale = { ...base, chapterStatus: 'draft', peerCheckerId: 5 };
    expect(await writtenBy(db, [stale])).toBe(0);
    expect(await row(db)).toMatchObject({
      status: 'peer_check',
      peer_checker_id: 6,
    });

    expect(await writtenBy(db, [{ ...stale, completedVerses: 9 }])).toBe(1);
    expect(await row(db)).toMatchObject({
      status: 'peer_check',
      peer_checker_id: 6,
      completed_verses: 9,
    });
  });

  it('still clears work the server no longer lists after a no-op pull', async () => {
    await insertChapterAssignmentSyncData([
      { ...base, chapterAssignmentId: 11, chapterNumber: 1, peerCheckerId: 4 },
      { ...base, chapterAssignmentId: 12, chapterNumber: 2, peerCheckerId: 4 },
    ]);
    await insertChapterAssignmentSyncData([
      { ...base, chapterAssignmentId: 11, chapterNumber: 1, peerCheckerId: 4 },
      { ...base, chapterAssignmentId: 12, chapterNumber: 2, peerCheckerId: 4 },
    ]);
    expect(
      await writtenBy(db, [
        {
          ...base,
          chapterAssignmentId: 11,
          chapterNumber: 1,
          peerCheckerId: 4,
        },
        {
          ...base,
          chapterAssignmentId: 12,
          chapterNumber: 2,
          peerCheckerId: 4,
        },
      ]),
    ).toBe(0);
    await reconcileUserChapterWork(4, [10], [11]);
    expect((await row(db, 11)).peer_checker_id).toBe(4);
    expect((await row(db, 12)).peer_checker_id).toBeNull();
    await reconcileUserChapterWork(4, [99], [11]);
    expect((await row(db, 10)).assigned_user_id).toBeNull();
  });
});
