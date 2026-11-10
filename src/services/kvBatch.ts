import type { QueryResult, Scalar } from '@op-engineering/op-sqlite';
import { kvStorage } from './storage';

type KvConnection = {
  executeSync: (query: string, params?: Scalar[]) => QueryResult;
};

// op-sqlite's Storage (checked against 15.2.14, see kvBatch.realSqlite.test.ts)
// keeps its connection private and has no transaction API. Batching must use
// that same connection; a second one would contend with Storage's own writes.
// Any other shape falls back to one write at a time.
function kvConnection(): KvConnection | null {
  const db = (
    kvStorage as unknown as { db?: Partial<KvConnection> } | undefined
  )?.db;
  return typeof db?.executeSync === 'function' ? (db as KvConnection) : null;
}

/**
 * Runs `fn`'s synchronous KV reads and writes as one SQLite transaction, so
 * they cost one commit on the JS thread instead of one per write. If `fn` or
 * the commit throws, the transaction is rolled back and the original error is
 * rethrown. Without access to the connection the writes run one by one, as
 * before.
 */
export function runKvBatchSync(fn: () => void): void {
  const db = kvConnection();
  if (!db) {
    fn();
    return;
  }
  db.executeSync('BEGIN');
  try {
    fn();
    db.executeSync('COMMIT');
  } catch (error) {
    try {
      db.executeSync('ROLLBACK');
    } catch {
      // SQLite may already have ended the transaction; the caller needs the
      // original failure, not this one.
    }
    throw error;
  }
}
