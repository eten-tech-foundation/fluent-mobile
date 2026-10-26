import type {
  DB,
  QueryResult,
  Scalar,
  Transaction,
} from '@op-engineering/op-sqlite';

/**
 * Minimal `node:sqlite` surface. Avoid a static `node:sqlite` import so
 * typecheck stays valid without `@types/node` (`tsconfig` types = jest only).
 */
type NodeSqliteStatement = {
  all: (...params: unknown[]) => unknown[];
};

type NodeSqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => NodeSqliteStatement;
  close: () => void;
};

type NodeSqliteModule = {
  DatabaseSync: new (path: string) => NodeSqliteDatabase;
};

function loadNodeSqlite(): NodeSqliteModule | null {
  try {
    const loaded = require('node:sqlite') as NodeSqliteModule;
    if (typeof loaded.DatabaseSync !== 'function') {
      return null;
    }
    return loaded;
  } catch {
    return null;
  }
}

/** True when Node's built-in SQLite can open an in-memory database. */
export function isNodeSqliteAvailable(): boolean {
  const sqlite = loadNodeSqlite();
  if (!sqlite) {
    return false;
  }
  try {
    const probe = new sqlite.DatabaseSync(':memory:');
    probe.close();
    return true;
  } catch {
    return false;
  }
}

function coerceParams(params: Scalar[] | undefined): unknown[] {
  return (params ?? []).map(value =>
    typeof value === 'boolean' ? (value ? 1 : 0) : value,
  );
}

function isMultiStatement(sql: string): boolean {
  const withoutTrailing = sql.trim().replace(/;\s*$/u, '');
  return withoutTrailing.includes(';');
}

function toQueryResult(rows: unknown[]): QueryResult {
  return {
    rowsAffected: 0,
    rows: rows.map(row =>
      row !== null && typeof row === 'object'
        ? { ...(row as Record<string, unknown>) }
        : row,
    ) as QueryResult['rows'],
  };
}

function executeOn(
  raw: NodeSqliteDatabase,
  query: string,
  params?: Scalar[],
): QueryResult {
  if (isMultiStatement(query)) {
    if (params !== undefined && params.length > 0) {
      throw new Error(
        'realSqlite: cannot bind parameters to multi-statement SQL',
      );
    }
    raw.exec(query);
    return toQueryResult([]);
  }

  const statement = raw.prepare(query);
  const coerced = coerceParams(params);
  const rows = coerced.length > 0 ? statement.all(...coerced) : statement.all();
  return toQueryResult(rows);
}

/**
 * In-memory SQLite (`node:sqlite` DatabaseSync) shaped like op-sqlite `DB`.
 * Used by migration tests that must fail if SQL only works on the fake driver.
 */
export function createRealSqliteDb(): DB {
  const sqlite = loadNodeSqlite();
  if (!sqlite) {
    throw new Error(
      'node:sqlite is not available (need Node >= 22.5; this repo requires >= 24.14.0)',
    );
  }

  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');

  const execute = async (
    query: string,
    params?: Scalar[],
  ): Promise<QueryResult> => executeOn(raw, query, params);

  const transaction = async (
    fn: (tx: Transaction) => Promise<void>,
  ): Promise<void> => {
    raw.exec('BEGIN');
    try {
      await fn({ execute } as Transaction);
      raw.exec('COMMIT');
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
  };

  return {
    execute,
    transaction,
    close: async () => {
      raw.close();
    },
  } as unknown as DB;
}
