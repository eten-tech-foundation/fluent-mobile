jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

import { setDatabase } from './db';
import { runMigrations } from './migrations';
import { getChapterAssignmentById } from './queries';
import { insertChapterAssignmentSyncData } from './repository';
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
    "INSERT INTO books (id, code, eng_display_name) VALUES (1, 'GEN', 'Genesis')",
  );
  await db.execute(
    "INSERT INTO bibles (id, language_id, name, abbreviation) VALUES (1, 1, 'GUJ', 'GUJ')",
  );
  await db.execute(
    "INSERT INTO projects (id, name, source_language_id, target_language_id, updated_at) VALUES (2, 'P', 1, 1, '2026-11-01')",
  );
  await db.execute(
    "INSERT INTO users (id, email) VALUES (4, 'a@x'), (5, 'b@x')",
  );
}

describeReal('getChapterAssignmentById (real SQLite)', () => {
  let db: Db;

  beforeEach(async () => {
    db = createRealSqliteDb();
    setDatabase(db);
    await seed(db);
  });

  it("carries the row's verse count in the same read", async () => {
    await insertChapterAssignmentSyncData([base]);
    const spy = jest.spyOn(db, 'execute');

    const assignment = await getChapterAssignmentById(10);

    expect(assignment).toMatchObject({ id: 10, totalVerses: 36 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is 0 when the chapter stores no count', async () => {
    await insertChapterAssignmentSyncData([{ ...base, totalVerses: 0 }]);

    expect(await getChapterAssignmentById(10)).toMatchObject({
      totalVerses: 0,
    });
  });

  it("keeps each assignment's own count", async () => {
    await insertChapterAssignmentSyncData([
      base,
      {
        ...base,
        chapterAssignmentId: 11,
        chapterNumber: 38,
        totalVerses: 30,
      },
    ]);

    expect((await getChapterAssignmentById(10))?.totalVerses).toBe(36);
    expect((await getChapterAssignmentById(11))?.totalVerses).toBe(30);
  });

  it('is null for a missing or deleted assignment', async () => {
    await insertChapterAssignmentSyncData([base]);
    await db.execute('DELETE FROM chapter_assignments WHERE id = 10');

    expect(await getChapterAssignmentById(10)).toBeNull();
    expect(await getChapterAssignmentById(999)).toBeNull();
  });
});
