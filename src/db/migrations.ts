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

export const CURRENT_SCHEMA_VERSION = 5;

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
 * Used by #99 (`chapter_assignments`) and #103 (`user_projects`).
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

/**
 * Restore `assigned_user_id` FK + `status` default + My Work index (#99).
 * Orphan assignment user ids are nulled so the copy succeeds with FKs on.
 * `user_projects.user_id` FK rebuild is owned by #103.
 */
export async function restoreChapterAssignmentAssignedUserIntegrity(
  db: SqlExecutor,
): Promise<void> {
  await rebuildTable(db, {
    tableName: 'chapter_assignments',
    createSql: `CREATE TABLE chapter_assignments_new (
      id               INTEGER PRIMARY KEY,
      project_unit_id  INTEGER NOT NULL REFERENCES project_units(id) ON DELETE CASCADE,
      bible_id         INTEGER NOT NULL REFERENCES bibles(id),
      book_id          INTEGER NOT NULL REFERENCES books(id),
      chapter_number   INTEGER NOT NULL,
      assigned_user_id INTEGER REFERENCES users(id),
      peer_checker_id  INTEGER,
      status           TEXT NOT NULL DEFAULT 'not_started',
      submitted_time   TEXT,
      updated_at       TEXT NOT NULL,
      total_verses     INTEGER NOT NULL DEFAULT 0,
      completed_verses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (project_unit_id, bible_id, book_id, chapter_number)
    )`,
    copySql: `INSERT INTO chapter_assignments_new (
      id, project_unit_id, bible_id, book_id, chapter_number,
      assigned_user_id, peer_checker_id, status, submitted_time, updated_at,
      total_verses, completed_verses
    )
    SELECT
      ca.id,
      ca.project_unit_id,
      ca.bible_id,
      ca.book_id,
      ca.chapter_number,
      CASE WHEN u.id IS NOT NULL THEN ca.assigned_user_id ELSE NULL END,
      ca.peer_checker_id,
      COALESCE(ca.status, 'not_started'),
      ca.submitted_time,
      ca.updated_at,
      COALESCE(ca.total_verses, 0),
      COALESCE(ca.completed_verses, 0)
    FROM chapter_assignments ca
    LEFT JOIN users u ON u.id = ca.assigned_user_id`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_ca_project_unit ON chapter_assignments(project_unit_id)',
      'CREATE INDEX IF NOT EXISTS idx_ca_assigned_user ON chapter_assignments(assigned_user_id)',
    ],
  });
}

/**
 * Add `user_projects.user_id` FK to `users(id)` (#103).
 * Orphan membership rows (unknown user or project) are dropped so the copy
 * succeeds with foreign keys enabled.
 */
export async function restoreUserProjectsUserIntegrity(
  db: SqlExecutor,
): Promise<void> {
  await rebuildTable(db, {
    tableName: 'user_projects',
    createSql: `CREATE TABLE user_projects_new (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, project_id)
    )`,
    copySql: `INSERT INTO user_projects_new (user_id, project_id)
    SELECT up.user_id, up.project_id
    FROM user_projects up
    INNER JOIN users u ON u.id = up.user_id
    INNER JOIN projects p ON p.id = up.project_id`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_up_user ON user_projects(user_id)',
    ],
  });
}

/**
 * Attribute recordings to the capturing account (#105).
 * Existing rows stay nullable; new captures set `recorded_by_user_id`.
 */
export async function addRecordingsRecordedByUser(
  db: SqlExecutor,
): Promise<void> {
  // Mid-version fixtures may lack `recordings`; production always has it after v1.
  const info = await db.execute('PRAGMA table_info(recordings)');
  if (!info.rows.length) {
    return;
  }
  await addColumnIfMissing(
    db,
    'recordings',
    'recorded_by_user_id',
    'INTEGER REFERENCES users(id)',
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_rec_verse_user
     ON recordings(bible_text_id, recorded_by_user_id, is_latest)`,
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
  {
    version: 3,
    name: 'chapter_assignment_assigned_user_integrity',
    up: restoreChapterAssignmentAssignedUserIntegrity,
  },
  {
    version: 4,
    name: 'user_projects_user_integrity',
    up: restoreUserProjectsUserIntegrity,
  },
  {
    version: 5,
    name: 'recordings_recorded_by_user',
    up: addRecordingsRecordedByUser,
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
