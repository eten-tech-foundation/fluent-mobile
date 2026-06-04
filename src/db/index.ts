import { open, DB } from '@op-engineering/op-sqlite';
import { createTableQueries } from './schema';
import { logger } from '../utils/logger';
import { setDatabase, getDatabase } from './db';

const log = logger.create('Database');
const DB_NAME = 'fluent.db';

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

    for (const query of createTableQueries) {
      try {
        await db.execute(query);
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          !error.message.includes('already exists')
        ) {
          log.error('SQL Error:', { error });
        }
      }
    }

    log.info('All tables created successfully');
  } catch (error: unknown) {
    log.error('Failed to initialize database:', { error });
    throw error;
  }
}
