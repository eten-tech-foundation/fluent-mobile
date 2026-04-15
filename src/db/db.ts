import { DB } from '@op-engineering/op-sqlite';

let db: DB | null = null;

export function setDatabase(instance: DB) {
  db = instance;
}

export function getDatabase(): DB {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
