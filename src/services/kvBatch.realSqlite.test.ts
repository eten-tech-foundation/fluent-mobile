import type { DB } from '@op-engineering/op-sqlite';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

// Shaped like op-sqlite's Storage: a private `db` connection behind the KV API.
let mockDb: DB | null = null;
const mockStatements: string[] = [];
// Statements that throw once, before they reach SQLite.
const mockFailOnce = new Set<string>();
jest.mock('./storage', () => ({
  get kvStorage() {
    if (!mockDb) return undefined;
    const db = mockDb;
    const executeSync = (query: string, params?: unknown[]) => {
      const verb = query.trim().split(/\s+/)[0].toUpperCase();
      mockStatements.push(verb);
      if (mockFailOnce.delete(verb)) throw new Error(`${verb} failed`);
      return db.executeSync(query, params as never);
    };
    return {
      db: { executeSync },
      getItemSync: (key: string) =>
        executeSync('SELECT value FROM storage WHERE key = ?', [key]).rows[0]
          ?.value as string | undefined,
      setItemSync: (key: string, value: string) => {
        executeSync(
          'INSERT OR REPLACE INTO storage (key, value) VALUES (?, ?)',
          [key, value],
        );
      },
    };
  },
}));

import { runKvBatchSync } from './kvBatch';
import { kvStorage } from './storage';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

describeReal('runKvBatchSync (real SQLite)', () => {
  beforeEach(() => {
    mockDb = createRealSqliteDb();
    mockDb.executeSync(
      'CREATE TABLE storage (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID',
    );
    mockStatements.length = 0;
    mockFailOnce.clear();
  });

  afterEach(() => {
    mockDb = null;
  });

  it('commits every write of the batch once', () => {
    runKvBatchSync(() => {
      for (let i = 0; i < 20; i += 1) {
        kvStorage.setItemSync(`k${i}`, String(i));
      }
      expect(kvStorage.getItemSync('k3')).toBe('3');
    });

    expect(kvStorage.getItemSync('k19')).toBe('19');
    expect(mockStatements.filter(s => s === 'BEGIN')).toHaveLength(1);
    expect(mockStatements.filter(s => s === 'COMMIT')).toHaveLength(1);
  });

  it('keeps none of the writes when the batch throws', () => {
    kvStorage.setItemSync('kept', 'before');

    expect(() =>
      runKvBatchSync(() => {
        kvStorage.setItemSync('kept', 'during');
        kvStorage.setItemSync('new', 'during');
        throw new Error('bad coverage');
      }),
    ).toThrow('bad coverage');

    expect(kvStorage.getItemSync('kept')).toBe('before');
    expect(kvStorage.getItemSync('new')).toBeUndefined();
    expect(mockStatements).toContain('ROLLBACK');
  });

  it('a failed commit keeps none of the writes and leaves the connection usable', () => {
    kvStorage.setItemSync('cursor', 'old');
    mockFailOnce.add('COMMIT');

    expect(() =>
      runKvBatchSync(() => {
        kvStorage.setItemSync('cursor', 'new');
        kvStorage.setItemSync('full_at', 'new');
      }),
    ).toThrow('COMMIT failed');

    expect(mockStatements).toContain('ROLLBACK');
    expect(kvStorage.getItemSync('cursor')).toBe('old');
    expect(kvStorage.getItemSync('full_at')).toBeUndefined();

    runKvBatchSync(() => {
      kvStorage.setItemSync('cursor', 'next');
    });
    expect(kvStorage.getItemSync('cursor')).toBe('next');
  });

  it('reports the original failure when the rollback fails too', () => {
    mockFailOnce.add('COMMIT');
    mockFailOnce.add('ROLLBACK');

    expect(() =>
      runKvBatchSync(() => {
        kvStorage.setItemSync('k', 'v');
      }),
    ).toThrow('COMMIT failed');
    mockDb!.executeSync('ROLLBACK');
  });

  it('runs the writes one by one when the connection is not reachable', () => {
    mockDb = null;
    const fn = jest.fn();

    runKvBatchSync(fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('installed op-sqlite Storage', () => {
  // runKvBatchSync relies on this private shape; an upgrade that changes it
  // must be re-checked, not silently fall back.
  it('keeps one private connection and reads and writes through it synchronously', () => {
    const fs = require('fs') as {
      readFileSync: (file: string, encoding: 'utf8') => string;
    };
    const root = 'node_modules/@op-engineering/op-sqlite';
    const { version } = JSON.parse(
      fs.readFileSync(`${root}/package.json`, 'utf8'),
    ) as { version: string };
    const source = fs.readFileSync(`${root}/src/Storage.ts`, 'utf8');

    expect(version).toBe('15.2.14');
    expect(source).toMatch(/private db: DB;/);
    expect(source).toMatch(/getItemSync[\s\S]*?this\.db\.executeSync\(/);
    expect(source).toMatch(/setItemSync[\s\S]*?this\.db\.executeSync\(/);
    expect(source).not.toMatch(/cache/i);
  });
});
