import type { DB } from '@op-engineering/op-sqlite';
import {
  createTableQueries,
  RECORDING_UPLOAD_INTENT_TRIGGER_SQL,
} from '../schema';
import {
  createRealSqliteDb,
  isNodeSqliteAvailable,
} from '../../test/realSqlite';

let mockDb: DB;

jest.mock('../db', () => ({
  getDatabase: () => mockDb,
}));

import {
  getHeldRecordings,
  getRecordingOwnerIds,
  hasRecordingsAffectedByMembership,
  reconcileHeldRecordings,
} from './heldRecordingsRepository';

const canUseRealSqlite = isNodeSqliteAvailable();

async function seed(db: DB): Promise<void> {
  await db.execute('INSERT INTO users (id, email) VALUES (?, ?), (?, ?)', [
    1,
    'drafter@example.com',
    2,
    'peer@example.com',
  ]);
  await db.execute(
    'INSERT INTO languages (id, lang_name, script_direction) VALUES (?, ?, ?)',
    [1, 'English', 'ltr'],
  );
  await db.execute(
    'INSERT INTO books (id, code, eng_display_name) VALUES (?, ?, ?)',
    [1, 'GEN', 'Genesis'],
  );
  await db.execute(
    `INSERT INTO bibles (id, language_id, name, abbreviation)
     VALUES (?, ?, ?, ?)`,
    [1, 1, 'Test Bible', 'TST'],
  );
  await db.execute(
    `INSERT INTO projects (
       id, name, source_language_id, target_language_id, is_active, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [100, 'Alpha', 1, 1, 1, 'not_assigned', '2024-01-01'],
  );
  await db.execute(
    `INSERT INTO projects (
       id, name, source_language_id, target_language_id, is_active, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [200, 'Beta', 1, 1, 1, 'not_assigned', '2024-01-01'],
  );
  await db.execute(
    'INSERT INTO project_units (id, project_id, status, name) VALUES (?, ?, ?, ?)',
    [10, 100, 'not_started', ''],
  );
  await db.execute(
    'INSERT INTO project_units (id, project_id, status, name) VALUES (?, ?, ?, ?)',
    [20, 200, 'not_started', ''],
  );
  // Only unit 20 has an assignment, so a take with a NULL captured unit can
  // still resolve to its project.
  await db.execute(
    `INSERT INTO chapter_assignments (
       id, project_unit_id, bible_id, book_id, chapter_number, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [500, 20, 1, 1, 1, 'draft', '2024-01-01'],
  );
  await db.execute(
    `INSERT INTO bible_texts (
       id, bible_id, book_id, chapter_number, verse_number, text
     ) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
    [1000, 1, 1, 1, 1, 'In the beginning', 1001, 1, 1, 1, 2, 'The earth'],
  );
  // User 1 is a member of Alpha only; user 2 is a member of Beta.
  await db.execute(
    'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
    [1, 100],
  );
  await db.execute(
    'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
    [2, 200],
  );

  const insertRecording = async (args: {
    id: string;
    bibleTextId: number;
    owner: number;
    unit: number | null;
    status: string;
    error?: string | null;
    takeNumber?: number;
  }): Promise<void> => {
    await db.execute(
      `INSERT INTO recordings (
         id, bible_text_id, recorded_by_user_id, project_unit_id,
         local_file_path, sync_status, upload_error, take_number,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.id,
        args.bibleTextId,
        args.owner,
        args.unit,
        `/recordings/${args.id}.m4a`,
        args.status,
        args.error ?? null,
        args.takeNumber ?? 1,
        '2024-01-01',
        '2024-01-01',
      ],
    );
  };

  await insertRecording({
    id: 'alpha-ok',
    bibleTextId: 1000,
    owner: 1,
    unit: 10,
    status: 'pending',
  });
  await insertRecording({
    id: 'beta-pending',
    bibleTextId: 1000,
    owner: 1,
    unit: 20,
    status: 'pending',
  });
  await insertRecording({
    id: 'beta-failed',
    bibleTextId: 1001,
    owner: 1,
    unit: 20,
    status: 'failed',
    error: 'Username not found on project',
  });
  await insertRecording({
    id: 'beta-peer-ok',
    bibleTextId: 1001,
    owner: 2,
    unit: 20,
    status: 'pending',
  });
  await insertRecording({
    id: 'beta-resolved-unit',
    bibleTextId: 1001,
    owner: 1,
    unit: null,
    status: 'pending',
    takeNumber: 2,
  });
}

async function statusOf(db: DB, id: string): Promise<string> {
  const result = await db.execute(
    'SELECT sync_status, upload_error FROM recordings WHERE id = ?',
    [id],
  );
  return String(result.rows[0]?.sync_status);
}

async function uploadErrorOf(db: DB, id: string): Promise<string | null> {
  const result = await db.execute(
    'SELECT upload_error FROM recordings WHERE id = ?',
    [id],
  );
  const value = result.rows[0]?.upload_error;
  return value === null || value === undefined ? null : String(value);
}

(canUseRealSqlite ? describe : describe.skip)('held recordings (#855)', () => {
  beforeEach(async () => {
    mockDb = createRealSqliteDb();
    for (const query of createTableQueries) {
      await mockDb.execute(query);
    }
    await seed(mockDb);
  });

  afterEach(async () => {
    await mockDb.close();
  });

  it('holds takes for projects the recording account left and keeps member work pending', async () => {
    await reconcileHeldRecordings(1, [1, 2]);

    await expect(statusOf(mockDb, 'alpha-ok')).resolves.toBe('pending');
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
    await expect(statusOf(mockDb, 'beta-failed')).resolves.toBe('held');
    await expect(statusOf(mockDb, 'beta-peer-ok')).resolves.toBe('pending');
    // NULL captured unit resolves through the chapter's only assignment.
    await expect(statusOf(mockDb, 'beta-resolved-unit')).resolves.toBe('held');
    // A held take is not a failure.
    await expect(uploadErrorOf(mockDb, 'beta-failed')).resolves.toBeNull();
  });

  it('lists held takes for the active account grouped-ready for the Sync page', async () => {
    await reconcileHeldRecordings(1, [1, 2]);

    const records = await getHeldRecordings(1);
    expect(records.map(record => record.id)).toEqual([
      'beta-pending',
      'beta-failed',
      'beta-resolved-unit',
    ]);
    expect(records[0]).toMatchObject({
      projectId: 200,
      projectName: 'Beta',
      bookName: 'Genesis',
      chapterNumber: 1,
      verseNumber: 1,
      takeNumber: 1,
      localFilePath: '/recordings/beta-pending.m4a',
    });
    // Two takes of the same verse keep their own take numbers.
    expect(records.find(record => record.id === 'beta-failed')).toMatchObject({
      verseNumber: 2,
      takeNumber: 1,
    });
    expect(
      records.find(record => record.id === 'beta-resolved-unit'),
    ).toMatchObject({ verseNumber: 2, takeNumber: 2 });
    // Another account's held/pending work is not shown here.
    await expect(getHeldRecordings(2)).resolves.toEqual([]);
  });

  it('releases held takes once membership returns so the next pass uploads them', async () => {
    await reconcileHeldRecordings(1, [1, 2]);
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');

    await mockDb.execute(
      'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
      [1, 200],
    );
    await reconcileHeldRecordings(1, [1, 2]);

    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
    await expect(statusOf(mockDb, 'beta-failed')).resolves.toBe('pending');
    await expect(statusOf(mockDb, 'beta-resolved-unit')).resolves.toBe(
      'pending',
    );
    await expect(getHeldRecordings(1)).resolves.toEqual([]);
  });

  it('holds an interrupted uploading take for a removed owner (#855)', async () => {
    await mockDb.execute(
      `UPDATE recordings SET sync_status = 'uploading' WHERE id = ?`,
      ['beta-pending'],
    );

    await reconcileHeldRecordings(1, [1, 2]);

    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
  });

  it('rejects instead of reporting a clean reconcile when the transaction fails', async () => {
    await mockDb.execute('DROP TABLE recordings');

    await expect(reconcileHeldRecordings(1, [1, 2])).rejects.toThrow();
  });

  it('does nothing without an active account', async () => {
    await expect(reconcileHeldRecordings(null, [1])).resolves.toEqual({
      held: 0,
      released: 0,
    });
    await expect(getHeldRecordings(null)).resolves.toEqual([]);
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
  });

  it('only acts on owners whose membership was verified', async () => {
    // Owner 1 could not be confirmed: its stale cache must not hold anything.
    const outcome = await reconcileHeldRecordings(1, [2]);

    expect(outcome).toEqual({ held: 0, released: 0 });
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
    await expect(statusOf(mockDb, 'beta-failed')).resolves.toBe('failed');

    await expect(reconcileHeldRecordings(1, [])).resolves.toEqual({
      held: 0,
      released: 0,
    });
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
  });

  it('does not release a held take for an unverified owner', async () => {
    await reconcileHeldRecordings(1, [1, 2]);
    await mockDb.execute(
      'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
      [1, 200],
    );

    await reconcileHeldRecordings(1, [2]);

    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
  });

  it('keeps a legacy take with no owner on the account that lost the project', async () => {
    await mockDb.execute(
      'UPDATE recordings SET recorded_by_user_id = NULL WHERE id = ?',
      ['beta-pending'],
    );

    // Account 1 is not a member of Beta, so the take is held under account 1.
    await reconcileHeldRecordings(1, [1]);
    const owner = await mockDb.execute(
      'SELECT recorded_by_user_id FROM recordings WHERE id = ?',
      ['beta-pending'],
    );
    expect(Number(owner.rows[0]?.recorded_by_user_id)).toBe(1);
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');

    // Switching to account 2, a member of Beta, must neither show nor release it.
    const forTwo = await getHeldRecordings(2);
    expect(forTwo.map(r => r.id)).not.toContain('beta-pending');
    await reconcileHeldRecordings(2, [2]);
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');

    const forOne = await getHeldRecordings(1);
    expect(forOne.map(r => r.id)).toContain('beta-pending');
  });

  it('reports whether any take is affected by membership', async () => {
    await expect(hasRecordingsAffectedByMembership()).resolves.toBe(true);

    await mockDb.execute(`UPDATE recordings SET sync_status = 'uploaded'`);
    await expect(hasRecordingsAffectedByMembership()).resolves.toBe(false);

    await mockDb.execute(
      `UPDATE recordings SET sync_status = 'held' WHERE id = ?`,
      ['alpha-ok'],
    );
    await expect(hasRecordingsAffectedByMembership()).resolves.toBe(true);
  });

  it("keeps a legacy take's upload generation when holding pins its unit and owner", async () => {
    // Production installs this trigger by migration; it bumps the generation
    // whenever the unit or owner changes.
    await mockDb.execute(RECORDING_UPLOAD_INTENT_TRIGGER_SQL);
    await mockDb.execute(
      `UPDATE recordings
       SET upload_intent_version = 3, recorded_by_user_id = NULL
       WHERE id = ?`,
      ['beta-resolved-unit'],
    );
    const generation = async () =>
      Number(
        (
          await mockDb.execute(
            'SELECT upload_intent_version FROM recordings WHERE id = ?',
            ['beta-resolved-unit'],
          )
        ).rows[0]?.upload_intent_version,
      );
    // Setting up the legacy row itself bumped it; start from that value.
    const before = await generation();

    await reconcileHeldRecordings(1, [1, 2]);

    const pinned = await mockDb.execute(
      'SELECT sync_status, project_unit_id, recorded_by_user_id FROM recordings WHERE id = ?',
      ['beta-resolved-unit'],
    );
    expect(pinned.rows[0]).toMatchObject({
      sync_status: 'held',
      project_unit_id: 20,
      recorded_by_user_id: 1,
    });
    await expect(generation()).resolves.toBe(before);

    // Released again with the same generation, so a dispatched activation is
    // still reconciled under its original precondition.
    await mockDb.execute(
      'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
      [1, 200],
    );
    await reconcileHeldRecordings(1, [1, 2]);
    await expect(statusOf(mockDb, 'beta-resolved-unit')).resolves.toBe(
      'pending',
    );
    await expect(generation()).resolves.toBe(before);
  });

  it('persists the resolved project unit when a take is held', async () => {
    await reconcileHeldRecordings(1, [1, 2]);

    const result = await mockDb.execute(
      'SELECT project_unit_id FROM recordings WHERE id = ?',
      ['beta-resolved-unit'],
    );
    expect(Number(result.rows[0]?.project_unit_id)).toBe(20);
  });

  it('lists the active account and every account with work on the device', async () => {
    const owners = await getRecordingOwnerIds(1);
    expect([...owners].sort()).toEqual([1, 2]);

    await mockDb.execute(
      `DELETE FROM recordings WHERE recorded_by_user_id = 2`,
    );
    await expect(getRecordingOwnerIds(1)).resolves.toEqual([1]);
    await expect(getRecordingOwnerIds(null)).resolves.toEqual([1]);
    // An account whose only queued work is a stage advance is refreshed too
    // (#854), so a removal can be confirmed for it.
    await mockDb.execute(
      `INSERT INTO stage_advance_queue
         (chapter_assignment_id, user_id, from_status, to_status, created_at)
       VALUES (500, 2, 'draft', 'peer_check', '2024-01-02')`,
    );
    const withStage = await getRecordingOwnerIds(1);
    expect([...withStage].sort()).toEqual([1, 2]);
  });
});
