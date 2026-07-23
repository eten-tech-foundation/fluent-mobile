import type {
  DB,
  QueryResult,
  Scalar,
  Transaction,
} from '@op-engineering/op-sqlite';
import { createTableQueries } from './schema';
import { logger } from '../utils/logger';

const log = logger.create('Migrations');

/** Anything that can run SQL (DB or in-transaction handle). */
export type SqlExecutor = {
  execute: (query: string, params?: Scalar[]) => Promise<QueryResult>;
};

export type Migration = {
  version: number;
  name: string;
  up: (db: SqlExecutor) => Promise<void>;
};

export const CURRENT_SCHEMA_VERSION = 2;

export async function getUserVersion(db: SqlExecutor): Promise<number> {
  const result = await db.execute('PRAGMA user_version');
  const row = result.rows[0] as { user_version?: number } | undefined;
  return row?.user_version ?? 0;
}

export async function setUserVersion(
  db: SqlExecutor,
  version: number,
): Promise<void> {
  await db.execute(`PRAGMA user_version = ${version}`);
}

export async function columnExists(
  db: SqlExecutor,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await db.execute(`PRAGMA table_info(${tableName})`);
  return result.rows.some(row => row.name === columnName);
}

export async function addColumnIfMissing(
  db: SqlExecutor,
  tableName: string,
  columnName: string,
  columnSql: string,
): Promise<void> {
  if (await columnExists(db, tableName, columnName)) {
    return;
  }
  await db.execute(
    `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`,
  );
}

export type RebuildTableOptions = {
  tableName: string;
  /** CREATE TABLE for the temporary `_new` table (must use `${tableName}_new`). */
  createSql: string;
  /** INSERT INTO … SELECT … FROM old table. */
  copySql: string;
  /** Indexes to recreate after rename. */
  indexes?: string[];
};

/**
 * SQLite table rebuild for FK / default / column-type changes.
 * Pattern: create `_new` → copy → drop old → rename → indexes.
 * Used by follow-ups #99 / #103 (not invoked by baseline migrations).
 */
export async function rebuildTable(
  db: SqlExecutor,
  options: RebuildTableOptions,
): Promise<void> {
  const { tableName, createSql, copySql, indexes = [] } = options;
  const tempName = `${tableName}_new`;

  await db.execute(createSql);
  await db.execute(copySql);
  await db.execute(`DROP TABLE ${tableName}`);
  await db.execute(`ALTER TABLE ${tempName} RENAME TO ${tableName}`);

  for (const indexSql of indexes) {
    await db.execute(indexSql);
  }
}

async function applyBaselineSchema(db: SqlExecutor): Promise<void> {
  for (const query of createTableQueries) {
    await db.execute(query);
  }
}

async function applyVerseProgressColumns(db: SqlExecutor): Promise<void> {
  await addColumnIfMissing(
    db,
    'chapter_assignments',
    'peer_checker_id',
    'INTEGER',
  );
  await addColumnIfMissing(
    db,
    'chapter_assignments',
    'total_verses',
    'INTEGER NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    db,
    'chapter_assignments',
    'completed_verses',
    'INTEGER NOT NULL DEFAULT 0',
  );
}

/** Ordered schema migrations. Version 1 = current CREATE IF NOT EXISTS baseline. */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'baseline_schema',
    up: applyBaselineSchema,
  },
  {
    version: 2,
    name: 'chapter_assignment_verse_progress',
    up: applyVerseProgressColumns,
  },
];

/**
 * Apply migrations with `version > PRAGMA user_version`, each once, in order.
 * Each step runs inside a DB transaction; `user_version` advances on success.
 */
export async function runMigrations(
  db: DB,
  steps: Migration[] = migrations,
): Promise<void> {
  const current = await getUserVersion(db);
  const pending = [...steps]
    .filter(step => step.version > current)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    log.info('Schema up to date', { userVersion: current });
    return;
  }

  for (const step of pending) {
    log.info('Applying migration', {
      version: step.version,
      name: step.name,
    });

    await db.transaction(async (tx: Transaction) => {
      await step.up(tx);
      await setUserVersion(tx, step.version);
    });
  }

  const next = await getUserVersion(db);
  log.info('Migrations complete', { userVersion: next });
}
