import type { DB } from '@op-engineering/op-sqlite';
import { createTableQueries } from '../schema';
import {
  createRealSqliteDb,
  isNodeSqliteAvailable,
} from '../../test/realSqlite';

let mockDb: DB;

jest.mock('../db', () => ({
  getDatabase: () => mockDb,
}));

import { getPendingRecordings } from '../repository';
import {
  DENIED_HOLD_PREFIX,
  getHeldRecordings,
  hasHeldRecordingsForUser,
  getRecordingOwnerIds,
  hasRecordingsAffectedByMembership,
  reconcileHeldRecordings,
  RELEASED_FROM_HOLD_MARKER,
  returnRecordingToHold,
} from './heldRecordingsRepository';
import { VERSE_AUDIO_ACCESS_DENIED_MESSAGE } from '../../types/api/errors';

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

async function addBackToBeta(db: DB): Promise<void> {
  await db.execute(
    'INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)',
    [1, 200],
  );
}

async function setBetaChapter(
  db: DB,
  chapter: { status: string; assignedUserId: number | null },
): Promise<void> {
  await db.execute(
    'UPDATE chapter_assignments SET status = ?, assigned_user_id = ? WHERE id = 500',
    [chapter.status, chapter.assignedUserId],
  );
}

async function assigneeOfBetaChapter(db: DB): Promise<number | null> {
  const result = await db.execute(
    'SELECT assigned_user_id FROM chapter_assignments WHERE id = 500',
  );
  const value = result.rows[0]?.assigned_user_id;
  return value === null || value === undefined ? null : Number(value);
}

async function claimQueue(
  db: DB,
): Promise<
  Array<{ chapterAssignmentId: number; userId: number; syncStatus: string }>
> {
  const result = await db.execute(
    `SELECT chapter_assignment_id, user_id, sync_status
     FROM chapter_claim_queue ORDER BY id`,
  );
  return (result.rows ?? []).map(row => ({
    chapterAssignmentId: Number(row.chapter_assignment_id),
    userId: Number(row.user_id),
    syncStatus: String(row.sync_status),
  }));
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

  it('releases held takes once the owner is a member and the drafter again', async () => {
    await reconcileHeldRecordings(1, [1, 2]);
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');

    await addBackToBeta(mockDb);
    await setBetaChapter(mockDb, { status: 'draft', assignedUserId: 1 });
    await reconcileHeldRecordings(1, [1, 2]);

    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
    await expect(statusOf(mockDb, 'beta-failed')).resolves.toBe('pending');
    await expect(statusOf(mockDb, 'beta-resolved-unit')).resolves.toBe(
      'pending',
    );
    // The marker lets a still-denied upload return to held, not fail.
    await expect(uploadErrorOf(mockDb, 'beta-pending')).resolves.toBe(
      RELEASED_FROM_HOLD_MARKER,
    );
    await expect(getHeldRecordings(1)).resolves.toEqual([]);
  });

  describe('after the owner is added back (#855 review)', () => {
    beforeEach(async () => {
      await reconcileHeldRecordings(1, [1, 2]);
      await addBackToBeta(mockDb);
    });

    it('keeps takes held while the drafting chapter has no drafter and cannot be claimed', async () => {
      // Removal cleared the drafter; text kept the chapter in draft, which the
      // server will not let a translator claim.
      await setBetaChapter(mockDb, { status: 'draft', assignedUserId: null });

      await reconcileHeldRecordings(1, [1, 2]);

      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
      await expect(claimQueue(mockDb)).resolves.toEqual([]);
      const records = await getHeldRecordings(1);
      expect(records.map(record => record.reason)).toEqual([
        'unassigned',
        'unassigned',
        'unassigned',
      ]);
    });

    it('keeps takes held while the chapter is drafted by someone else', async () => {
      await setBetaChapter(mockDb, { status: 'draft', assignedUserId: 2 });

      await reconcileHeldRecordings(1, [1, 2]);

      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
      await expect(claimQueue(mockDb)).resolves.toEqual([]);
    });

    it('claims an unassigned not-started chapter and releases its takes once the claim lands', async () => {
      await setBetaChapter(mockDb, {
        status: 'not_started',
        assignedUserId: null,
      });

      await reconcileHeldRecordings(1, [1, 2]);

      await expect(assigneeOfBetaChapter(mockDb)).resolves.toBe(1);
      await expect(claimQueue(mockDb)).resolves.toEqual([
        { chapterAssignmentId: 500, userId: 1, syncStatus: 'pending' },
      ]);
      // The server still says not started until the claim lands, and would
      // deny the upload: the takes wait.
      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
      const waiting = await getHeldRecordings(1);
      expect(waiting.every(record => record.reason === 'waiting')).toBe(true);

      // A later pass does not queue the claim twice.
      await reconcileHeldRecordings(1, [1, 2]);
      await expect(claimQueue(mockDb)).resolves.toHaveLength(1);

      // The claim push won and resolved the queue row.
      await mockDb.execute('DELETE FROM chapter_claim_queue');
      await reconcileHeldRecordings(1, [1, 2]);

      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
      await expect(statusOf(mockDb, 'beta-resolved-unit')).resolves.toBe(
        'pending',
      );
    });

    it('keeps takes held when the automatic claim was rejected', async () => {
      await setBetaChapter(mockDb, {
        status: 'not_started',
        assignedUserId: null,
      });
      await reconcileHeldRecordings(1, [1, 2]);
      await mockDb.execute(
        `UPDATE chapter_claim_queue SET sync_status = 'claim_rejected'`,
      );

      await reconcileHeldRecordings(1, [1, 2]);

      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
    });

    it('claims a chapter at most once per hold when the server refuses it', async () => {
      await setBetaChapter(mockDb, {
        status: 'not_started',
        assignedUserId: null,
      });
      await reconcileHeldRecordings(1, [1, 2]);
      await expect(claimQueue(mockDb)).resolves.toHaveLength(1);

      // Refused, then the assignment pull restores the unassigned chapter and
      // reconcilePendingClaimsAfterAssignmentPull drops the queue row.
      await mockDb.execute('DELETE FROM chapter_claim_queue');
      await setBetaChapter(mockDb, {
        status: 'not_started',
        assignedUserId: null,
      });

      await reconcileHeldRecordings(1, [1, 2]);

      await expect(claimQueue(mockDb)).resolves.toEqual([]);
      await expect(assigneeOfBetaChapter(mockDb)).resolves.toBeNull();
      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
      const records = await getHeldRecordings(1);
      expect(records.every(record => record.reason === 'unassigned')).toBe(
        true,
      );
    });

    it("does not claim for an account that is not active (claims go out under the active account's token)", async () => {
      await setBetaChapter(mockDb, {
        status: 'not_started',
        assignedUserId: null,
      });

      await reconcileHeldRecordings(2, [1, 2]);

      await expect(assigneeOfBetaChapter(mockDb)).resolves.toBeNull();
      await expect(claimQueue(mockDb)).resolves.toEqual([]);
      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
    });

    it('does not claim when the owner is not a member', async () => {
      await mockDb.execute(
        'DELETE FROM user_projects WHERE user_id = ? AND project_id = ?',
        [1, 200],
      );
      await setBetaChapter(mockDb, {
        status: 'not_started',
        assignedUserId: null,
      });

      await reconcileHeldRecordings(1, [1, 2]);

      await expect(claimQueue(mockDb)).resolves.toEqual([]);
      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
      const records = await getHeldRecordings(1);
      expect(records.every(record => record.reason === 'removed')).toBe(true);
    });
  });

  describe('a released take the server still denied', () => {
    beforeEach(async () => {
      await reconcileHeldRecordings(1, [1, 2]);
      await addBackToBeta(mockDb);
    });

    it('is not released again until its chapter assignment changes', async () => {
      // Peer check with the owner as drafter: nothing local predicts that the
      // server denies a translator here, so the take is released once.
      await setBetaChapter(mockDb, {
        status: 'peer_check',
        assignedUserId: 1,
      });
      await reconcileHeldRecordings(1, [1, 2]);
      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');

      await expect(returnRecordingToHold('beta-pending', 0)).resolves.toBe(
        true,
      );
      await expect(uploadErrorOf(mockDb, 'beta-pending')).resolves.toBe(
        `${DENIED_HOLD_PREFIX}peer_check:1::2024-01-01`,
      );

      await reconcileHeldRecordings(1, [1, 2]);
      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
      const records = await getHeldRecordings(1);
      expect(records.find(record => record.id === 'beta-pending')?.reason).toBe(
        'denied',
      );

      // The assignment pull brings a change (only its timestamp here, so
      // the fingerprint's updated_at alone must be enough): try again.
      await mockDb.execute(
        `UPDATE chapter_assignments SET updated_at = '2024-02-01' WHERE id = 500`,
      );
      await reconcileHeldRecordings(1, [1, 2]);
      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
    });
  });

  it('hands the released-from-hold marker to the upload worker', async () => {
    await reconcileHeldRecordings(1, [1, 2]);
    await addBackToBeta(mockDb);
    await setBetaChapter(mockDb, { status: 'draft', assignedUserId: 1 });
    await reconcileHeldRecordings(1, [1, 2]);

    const pending = await getPendingRecordings();

    expect(pending.find(row => row.id === 'beta-pending')?.uploadError).toBe(
      RELEASED_FROM_HOLD_MARKER,
    );
    expect(pending.find(row => row.id === 'alpha-ok')?.uploadError).toBeNull();
  });

  it('reports whether an account has held takes', async () => {
    await expect(hasHeldRecordingsForUser(1)).resolves.toBe(false);
    await reconcileHeldRecordings(1, [1, 2]);
    await expect(hasHeldRecordingsForUser(1)).resolves.toBe(true);
    await expect(hasHeldRecordingsForUser(2)).resolves.toBe(false);
  });

  describe('takes an earlier build failed with the masked 404', () => {
    beforeEach(async () => {
      await addBackToBeta(mockDb);
      await mockDb.execute(
        `UPDATE recordings SET sync_status = 'failed', upload_error = ?
         WHERE id = 'beta-pending'`,
        [VERSE_AUDIO_ACCESS_DENIED_MESSAGE],
      );
    });

    it('holds them while the chapter is not assigned to the owner', async () => {
      await setBetaChapter(mockDb, { status: 'draft', assignedUserId: null });

      // Counted as held, so the Sync page list refreshes.
      await expect(reconcileHeldRecordings(1, [1, 2])).resolves.toEqual({
        held: 1,
        released: 0,
      });

      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
      await expect(uploadErrorOf(mockDb, 'beta-pending')).resolves.toBeNull();
    });

    it('releases them on the same pass once the owner drafts the chapter', async () => {
      await setBetaChapter(mockDb, { status: 'draft', assignedUserId: 1 });

      await reconcileHeldRecordings(1, [1, 2]);

      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
      await expect(uploadErrorOf(mockDb, 'beta-pending')).resolves.toBe(
        RELEASED_FROM_HOLD_MARKER,
      );
    });

    it("leaves a member's take that failed for another reason failed", async () => {
      await setBetaChapter(mockDb, { status: 'draft', assignedUserId: null });

      await reconcileHeldRecordings(1, [1, 2]);

      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
      await expect(statusOf(mockDb, 'beta-failed')).resolves.toBe('failed');
    });

    it('leaves an unverified owner failed', async () => {
      await setBetaChapter(mockDb, { status: 'draft', assignedUserId: null });

      await reconcileHeldRecordings(1, [2]);

      await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('failed');
    });
  });

  it('returns a released take to held unless a newer local change owns it', async () => {
    await mockDb.execute(
      `UPDATE recordings SET upload_intent_version = 3 WHERE id = 'alpha-ok'`,
    );

    await expect(returnRecordingToHold('alpha-ok', 2)).resolves.toBe(false);
    await expect(statusOf(mockDb, 'alpha-ok')).resolves.toBe('pending');

    await expect(returnRecordingToHold('alpha-ok', 3)).resolves.toBe(true);
    await expect(statusOf(mockDb, 'alpha-ok')).resolves.toBe('held');
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
  });
});
