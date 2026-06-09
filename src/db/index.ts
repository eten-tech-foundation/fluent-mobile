import { open, DB } from '@op-engineering/op-sqlite';
import { chapterAssignmentMigrations, createTableQueries } from './schema';
import { logger } from '../utils/logger';
import { setDatabase, getDatabase } from './db';

const log = logger.create('Database');
const DB_NAME = 'fluent.db';

function shouldIgnoreInitError(
  message: string,
  kind: 'table' | 'column',
): boolean {
  const lower = message.toLowerCase();
  return kind === 'table'
    ? lower.includes('already exists')
    : lower.includes('duplicate column');
}

async function runStatements(
  db: DB,
  statements: string[],
  kind: 'table' | 'column',
): Promise<void> {
  for (const query of statements) {
    try {
      await db.execute(query);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        shouldIgnoreInitError(error.message, kind)
      ) {
        continue;
      }
      log.error(kind === 'table' ? 'SQL Error:' : 'Migration error:', {
        error,
      });
    }
  }
}

export async function initializeDatabase(): Promise<void> {
  try {
    const existing = getDatabase();
    if (existing) {
      log.info('Database already initialized, skipping open');
      return;
    }
  } catch {
    log.warn('Error accessing existing database, attempting to open a new one');
  }

  try {
    log.info('Opening database...');
    const db: DB = open({
      name: DB_NAME,
      location: 'default',
    });

    log.info('Database opened successfully');
    setDatabase(db);

    await db.execute('PRAGMA foreign_keys = ON;');
    await db.execute('PRAGMA journal_mode = WAL;');
    await db.execute('PRAGMA synchronous = NORMAL;');
    await db.execute('PRAGMA busy_timeout = 5000;');

    await runStatements(db, createTableQueries, 'table');
    await runStatements(db, chapterAssignmentMigrations, 'column');

    log.info('All tables created successfully');
  } catch (error: unknown) {
    log.error('Failed to initialize database:', { error });
    throw error;
  }
}
