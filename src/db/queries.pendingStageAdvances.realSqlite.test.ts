// queries.ts reaches op-sqlite's KV Storage through parseUserId; the real
// driver here is the node:sqlite DB below, not this module.
jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

import type { DB } from '@op-engineering/op-sqlite';
import { setDatabase } from './db';
import { runMigrations } from './migrations';
import { hasPendingStageAdvancesForUser } from './queries';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const canUseRealSqlite = isNodeSqliteAvailable();
const ME = 5;
const RAVI = 6;

async function queueAdvance(
  db: DB,
  id: number,
  userId: number,
  syncStatus: string,
): Promise<void> {
  await db.execute(
    `INSERT INTO stage_advance_queue (
      id, chapter_assignment_id, user_id, from_status, to_status, created_at, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, 1, userId, 'draft', 'peer_check', '2026-11-23T00:00:00Z', syncStatus],
  );
}

(canUseRealSqlite ? describe : describe.skip)(
  'hasPendingStageAdvancesForUser against real SQLite',
  () => {
    let db: DB;

    beforeEach(async () => {
      db = createRealSqliteDb();
      await runMigrations(db);
      await db.execute('PRAGMA foreign_keys = OFF');
      setDatabase(db);
    });

    afterEach(() => {
      db.close();
    });

    it('is true only for a pending advance queued by this user', async () => {
      await queueAdvance(db, 1, RAVI, 'pending');
      await queueAdvance(db, 2, ME, 'synced');
      await expect(hasPendingStageAdvancesForUser(ME)).resolves.toBe(false);

      await queueAdvance(db, 3, ME, 'pending');
      await expect(hasPendingStageAdvancesForUser(ME)).resolves.toBe(true);
    });
  },
);
