import type { DB } from '@op-engineering/op-sqlite';
import { createRealSqliteDb } from '../test/realSqlite';
import { runMigrations } from '../db/migrations';
import {
  getSyncStatusSnapshot,
  refreshSyncStatusStore,
  refreshSyncStatusStoreIfChanged,
  resetSyncStatusStore,
  resetSyncStatusStoreForTests,
  subscribeToSyncStatusStore,
} from './syncStatusStore';
import { emitUploadSessionEvent } from './syncEvents';

let mockDb: DB;
let mockUserId = '7';
jest.mock('../db/db', () => ({ getDatabase: () => mockDb }));
jest.mock('./storage', () => ({
  getActiveUserId: () => mockUserId,
  getUserIdSync: () => mockUserId,
}));
jest.mock('./recordingDataEvents', () => ({
  onRecordingDataChanged: () => () => {},
  emitRecordingDataChanged: jest.fn(),
}));

async function addSelectedTake(
  id: string,
  verse: number,
  db = mockDb,
  recordedBy = 7,
) {
  await db.execute(
    `INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
       VALUES (?, 1, 40, 1, ?, 'Fixture')`,
    [verse, verse],
  );
  await db.execute(
    `INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
       local_file_path, is_selected, sync_status, start_chapter, start_verse,
       end_chapter, end_verse, created_at, updated_at)
       VALUES (?, ?, ?, 12, 'file:///take.m4a', 1, 'pending', 1, ?, 1, ?, '2026-01-01', '2026-01-01')`,
    [id, verse, recordedBy, verse, verse],
  );
}

/** Users 7 and 8, one project unit and one pending take by `takeBy`. */
async function fixtureDb(takeBy = 7): Promise<DB> {
  const db = createRealSqliteDb();
  await runMigrations(db);
  await db.execute(`
    INSERT INTO users(id, email) VALUES (7, 'fixture@example.test'), (8, 'other@example.test');
    INSERT INTO languages(id, lang_name, script_direction) VALUES (1, 'Fixture', 'ltr');
    INSERT INTO books(id, code, eng_display_name) VALUES (40, 'MAT', 'Matthew');
    INSERT INTO bibles(id, language_id, name, abbreviation) VALUES (1, 1, 'Fixture', 'FIX');
    INSERT INTO projects(id, name, source_language_id, target_language_id, is_active, status, updated_at)
      VALUES (1, 'Fixture', 1, 1, 1, 'not_assigned', '2026-01-01');
    INSERT INTO project_units(id, project_id, status, name) VALUES (12, 1, 'not_started', '');
  `);
  await addSelectedTake('a', 1, db, takeBy);
  return db;
}

async function writeCount(db: DB): Promise<number> {
  const result = await db.execute('SELECT total_changes() AS changes');
  return Number(result.rows?.[0]?.changes);
}

const isWriteMark = (sql: unknown) => String(sql).includes('total_changes()');

describe('sync status refresh against real SQLite', () => {
  let execute: jest.SpyInstance;
  let realExecute: DB['execute'];

  beforeEach(async () => {
    resetSyncStatusStoreForTests();
    mockUserId = '7';
    mockDb = await fixtureDb();
    realExecute = mockDb.execute.bind(mockDb);
    execute = jest.spyOn(mockDb, 'execute');
  });

  afterEach(async () => {
    execute.mockRestore();
    await mockDb.close();
  });

  it('runs the status reads once for callers in the same turn', async () => {
    await Promise.all([
      refreshSyncStatusStore(),
      refreshSyncStatusStore(),
      refreshSyncStatusStore(),
    ]);

    expect(execute).toHaveBeenCalledTimes(5);
    expect(getSyncStatusSnapshot()).toMatchObject({
      pendingCount: 1,
      pendingChapterCount: 1,
      countsUnknown: false,
    });
  });

  it('sees a take saved before a later refresh', async () => {
    await refreshSyncStatusStore();
    await addSelectedTake('b', 2);

    await refreshSyncStatusStore();

    expect(getSyncStatusSnapshot().pendingCount).toBe(2);
    expect(
      execute.mock.calls.filter(([sql]) => /^\s*SELECT/i.test(sql)),
    ).toHaveLength(10);
  });

  describe('only when something changed', () => {
    const statusReads = () =>
      execute.mock.calls.filter(([sql]) => !isWriteMark(sql)).length;

    it('skips the status reads when nothing was written since', async () => {
      await refreshSyncStatusStoreIfChanged();
      execute.mockClear();

      await refreshSyncStatusStoreIfChanged();

      expect(execute).toHaveBeenCalledTimes(1);
      expect(statusReads()).toBe(0);
      expect(getSyncStatusSnapshot().pendingCount).toBe(1);
    });

    it('shares one check for callers in the same turn', async () => {
      await Promise.all([
        refreshSyncStatusStoreIfChanged(),
        refreshSyncStatusStoreIfChanged(),
      ]);

      expect(
        execute.mock.calls.filter(([sql]) => isWriteMark(sql)),
      ).toHaveLength(1);
      expect(statusReads()).toBe(5);
    });

    it('reads again after a take is saved', async () => {
      await refreshSyncStatusStoreIfChanged();
      await addSelectedTake('b', 2);
      execute.mockClear();

      await refreshSyncStatusStoreIfChanged();

      expect(statusReads()).toBe(5);
      expect(getSyncStatusSnapshot().pendingCount).toBe(2);
    });

    it('reads again for another user', async () => {
      await refreshSyncStatusStoreIfChanged();
      mockUserId = '8';
      execute.mockClear();

      await refreshSyncStatusStoreIfChanged();

      expect(statusReads()).toBe(5);
      expect(getSyncStatusSnapshot().pendingCount).toBe(0);
    });

    it('reads again after a reset', async () => {
      await refreshSyncStatusStoreIfChanged();
      resetSyncStatusStore();
      execute.mockClear();

      await refreshSyncStatusStoreIfChanged();

      expect(statusReads()).toBe(5);
      expect(getSyncStatusSnapshot().pendingCount).toBe(1);
    });

    it('reads again after a failed read, with nothing written', async () => {
      await refreshSyncStatusStoreIfChanged();
      let fail = true;
      execute.mockImplementation((sql: string, params?: unknown[]) =>
        fail && sql.includes('AS orphan_bible_text')
          ? Promise.reject(new Error('busy'))
          : realExecute(sql, params as never),
      );
      await refreshSyncStatusStore();
      expect(getSyncStatusSnapshot().countsUnknown).toBe(true);
      fail = false;
      execute.mockClear();

      await refreshSyncStatusStoreIfChanged();

      expect(statusReads()).toBe(5);
      expect(getSyncStatusSnapshot().countsUnknown).toBe(false);
    });

    it("never reuses another database's counts with the same write count", async () => {
      await refreshSyncStatusStoreIfChanged();
      const replacement = await fixtureDb(8);
      expect(await writeCount(replacement)).toBe(await writeCount(mockDb));
      const previous = mockDb;
      execute.mockRestore();
      mockDb = replacement;
      execute = jest.spyOn(mockDb, 'execute');

      await refreshSyncStatusStoreIfChanged();

      expect(statusReads()).toBe(5);
      expect(getSyncStatusSnapshot().pendingCount).toBe(0);
      await previous.close();
    });

    it('re-reads on an idle pass with nothing uploading only after a write', async () => {
      const unsubscribe = subscribeToSyncStatusStore(() => {});
      await refreshSyncStatusStoreIfChanged();
      execute.mockClear();

      emitUploadSessionEvent({ type: 'idle' });
      await settle();
      expect(statusReads()).toBe(0);

      await addSelectedTake('b', 2);
      execute.mockClear();
      emitUploadSessionEvent({ type: 'idle' });
      await settle();
      expect(statusReads()).toBe(5);
      expect(getSyncStatusSnapshot().pendingCount).toBe(2);
      unsubscribe();
    });

    it('re-reads and ends the upload on an idle that finishes one', async () => {
      const unsubscribe = subscribeToSyncStatusStore(() => {});
      emitUploadSessionEvent({ type: 'start', totalChapters: 1 });
      await settle();
      await refreshSyncStatusStoreIfChanged();
      expect(getSyncStatusSnapshot().isUploading).toBe(true);
      execute.mockClear();

      emitUploadSessionEvent({ type: 'idle' });
      await settle();

      expect(statusReads()).toBe(5);
      expect(getSyncStatusSnapshot().isUploading).toBe(false);
      unsubscribe();
    });

    it('still re-reads on every other upload event', async () => {
      const unsubscribe = subscribeToSyncStatusStore(() => {});
      await refreshSyncStatusStoreIfChanged();
      execute.mockClear();

      emitUploadSessionEvent({ type: 'paused', reason: 'user' });
      await settle();

      expect(statusReads()).toBe(5);
      unsubscribe();
    });

    describe('with a read held out', () => {
      /** The next pending-count read answers now but is delivered on release. */
      function holdNextPendingRead() {
        let release!: () => void;
        let armed = true;
        execute.mockImplementation((sql: string, params?: unknown[]) => {
          const result = realExecute(sql, params as never);
          if (!armed || !sql.includes('FROM recording_deletions'))
            return result;
          armed = false;
          return new Promise(res => {
            release = () => res(result);
          });
        });
        return () => release();
      }

      it('reads again after a take saved while the read was out', async () => {
        const release = holdNextPendingRead();
        const held = refreshSyncStatusStoreIfChanged();
        await settle();
        await addSelectedTake('b', 2);
        release();
        await held;
        expect(getSyncStatusSnapshot().pendingCount).toBe(1);
        execute.mockClear();

        await refreshSyncStatusStoreIfChanged();

        expect(statusReads()).toBe(5);
        expect(getSyncStatusSnapshot().pendingCount).toBe(2);
      });

      it("keeps the new account's counts and check when the old one lands", async () => {
        const release = holdNextPendingRead();
        const older = refreshSyncStatusStoreIfChanged();
        await settle();
        resetSyncStatusStore();
        mockUserId = '8';
        execute.mockClear();
        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(5);
        expect(getSyncStatusSnapshot().pendingCount).toBe(0);

        release();
        await older;
        await settle();
        expect(getSyncStatusSnapshot().pendingCount).toBe(0);
        execute.mockClear();
        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(0);

        mockUserId = '7';
        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(5);
        expect(getSyncStatusSnapshot().pendingCount).toBe(1);
      });

      it('reads for the new account when the old check resumes after a switch', async () => {
        let releaseMark!: () => void;
        let armed = true;
        execute.mockImplementation((sql: string, params?: unknown[]) => {
          const result = realExecute(sql, params as never);
          if (!armed || !isWriteMark(sql)) return result;
          armed = false;
          return new Promise(res => {
            releaseMark = () => res(result);
          });
        });
        const older = refreshSyncStatusStoreIfChanged();
        await settle();
        resetSyncStatusStore();
        mockUserId = '8';

        releaseMark();
        await older;

        expect(getSyncStatusSnapshot().pendingCount).toBe(0);
        mockUserId = '7';
        execute.mockClear();
        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(5);
        expect(getSyncStatusSnapshot().pendingCount).toBe(1);
      });
    });

    describe('when a query answers empty because it failed', () => {
      const isChapters = (sql: string) =>
        sql.includes('ORDER BY book_id, chapter_number');
      const isFailedCount = (sql: string) =>
        sql.includes("sync_status = 'failed'") && sql.includes('COUNT(*)');

      /** Make the next matching query throw; real SQLite answers the rest. */
      function failOnce(match: (sql: string) => boolean) {
        let armed = true;
        execute.mockImplementation((sql: string, params?: unknown[]) => {
          if (armed && match(sql)) {
            armed = false;
            return Promise.reject(new Error('disk I/O error'));
          }
          return realExecute(sql, params as never);
        });
      }
      const recover = () =>
        execute.mockImplementation((sql: string, params?: unknown[]) =>
          realExecute(sql, params as never),
        );

      it('keeps the known chapters, reads unknown, and retries with no new write', async () => {
        await refreshSyncStatusStoreIfChanged();
        expect(getSyncStatusSnapshot()).toMatchObject({
          pendingChapterCount: 1,
          countsUnknown: false,
        });
        const writesBefore = await writeCount(mockDb);

        failOnce(isChapters);
        await refreshSyncStatusStore();

        expect(getSyncStatusSnapshot()).toMatchObject({
          pendingCount: 1,
          pendingChapterCount: 1,
          countsUnknown: true,
        });
        recover();
        execute.mockClear();

        await refreshSyncStatusStoreIfChanged();

        expect(await writeCount(mockDb)).toBe(writesBefore);
        expect(statusReads()).toBe(5);
        expect(getSyncStatusSnapshot()).toMatchObject({
          pendingChapterCount: 1,
          countsUnknown: false,
        });
        execute.mockClear();
        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(0);
      });

      it('never reads All synced from a first read that failed, then finds the pending work', async () => {
        failOnce(isChapters);
        await refreshSyncStatusStoreIfChanged();

        expect(getSyncStatusSnapshot()).toMatchObject({
          pendingCount: 1,
          countsUnknown: true,
        });
        recover();
        execute.mockClear();

        await refreshSyncStatusStoreIfChanged();

        expect(statusReads()).toBe(5);
        expect(getSyncStatusSnapshot()).toMatchObject({
          pendingCount: 1,
          pendingChapterCount: 1,
          countsUnknown: false,
        });
      });

      it('tells a failed empty read from a valid empty one', async () => {
        await mockDb.execute('DELETE FROM recordings');

        failOnce(isChapters);
        await refreshSyncStatusStoreIfChanged();
        expect(getSyncStatusSnapshot()).toMatchObject({
          pendingChapterCount: 0,
          countsUnknown: true,
        });
        recover();
        execute.mockClear();

        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(5);
        expect(getSyncStatusSnapshot()).toMatchObject({
          pendingChapterCount: 0,
          countsUnknown: false,
        });

        // A valid empty answer is reusable while nothing is written.
        execute.mockClear();
        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(0);
        expect(getSyncStatusSnapshot().countsUnknown).toBe(false);
      });

      it('a forced refresh re-reads and recovers too', async () => {
        await refreshSyncStatusStoreIfChanged();
        failOnce(isChapters);
        await refreshSyncStatusStoreIfChanged();
        await refreshSyncStatusStore();
        expect(getSyncStatusSnapshot().countsUnknown).toBe(true);
        recover();
        execute.mockClear();

        await refreshSyncStatusStore();

        expect(statusReads()).toBe(5);
        expect(getSyncStatusSnapshot().countsUnknown).toBe(false);
      });

      it('keeps the failed uploads when the failed-count read fails, and retries', async () => {
        await mockDb.execute(
          "UPDATE recordings SET sync_status = 'failed', upload_error = 'boom'",
        );
        await refreshSyncStatusStoreIfChanged();
        expect(getSyncStatusSnapshot()).toMatchObject({
          failedCount: 1,
          failedErrorText: 'boom',
        });

        failOnce(isFailedCount);
        await refreshSyncStatusStore();
        expect(getSyncStatusSnapshot()).toMatchObject({
          failedCount: 1,
          failedErrorText: 'boom',
          countsUnknown: true,
        });
        recover();
        execute.mockClear();

        await refreshSyncStatusStoreIfChanged();

        expect(statusReads()).toBe(5);
        expect(getSyncStatusSnapshot()).toMatchObject({
          failedCount: 1,
          countsUnknown: false,
        });
      });

      it('retries after a reset and for a replaced connection', async () => {
        failOnce(isChapters);
        await refreshSyncStatusStoreIfChanged();
        recover();
        resetSyncStatusStore();
        expect(getSyncStatusSnapshot().countsUnknown).toBe(false);
        execute.mockClear();

        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(5);

        const replacement = await fixtureDb(8);
        const previous = mockDb;
        execute.mockRestore();
        mockDb = replacement;
        execute = jest.spyOn(mockDb, 'execute');
        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(5);
        await previous.close();
      });

      it("does not let an older account's failed read replace the new account's counts or check", async () => {
        let releaseOlder!: () => void;
        let armed = true;
        execute.mockImplementation((sql: string, params?: unknown[]) => {
          if (armed && isChapters(sql)) {
            armed = false;
            return new Promise((_, reject) => {
              releaseOlder = () => reject(new Error('disk I/O error'));
            });
          }
          return realExecute(sql, params as never);
        });
        const older = refreshSyncStatusStoreIfChanged();
        await settle();
        resetSyncStatusStore();
        mockUserId = '8';
        await refreshSyncStatusStoreIfChanged();
        expect(getSyncStatusSnapshot()).toMatchObject({
          pendingCount: 0,
          countsUnknown: false,
        });

        releaseOlder();
        await older;
        await settle();

        expect(getSyncStatusSnapshot()).toMatchObject({
          pendingCount: 0,
          countsUnknown: false,
        });
        execute.mockClear();
        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(0);
      });

      it('costs the same five reads on success as before', async () => {
        await refreshSyncStatusStoreIfChanged();
        expect(statusReads()).toBe(5);
        execute.mockClear();
        await refreshSyncStatusStoreIfChanged();
        expect(execute).toHaveBeenCalledTimes(1);
      });
    });
  });
});

function settle() {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}
