import { open } from '@op-engineering/op-sqlite';
import { createTableQueries } from './schema';
import { setDatabase } from './db';

const DB_NAME = 'fluent.db';

export async function initializeDatabase(): Promise<void> {
  try {
    const db = await open({
      name: DB_NAME,
      location: 'default',
    });

    console.log('Database opened successfully');

    setDatabase(db);

    await db.execute('PRAGMA foreign_keys = ON;');
    await db.execute('PRAGMA journal_mode = WAL;');
    await db.execute('PRAGMA synchronous = NORMAL;');
    await db.execute('PRAGMA busy_timeout = 5000;');

    for (const query of createTableQueries) {
      try {
        await db.execute(query);
      } catch (error: any) {
        if (!error.message?.includes('already exists')) {
          console.error('SQL Error:', error);
        }
      }
    }

    console.log('All tables created successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}
