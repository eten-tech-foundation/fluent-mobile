import { getDatabase } from './db';
import { logger } from '../utils/logger';
import type {
  Recording,
  RecordingRow,
  RecordingSyncStatus,
} from '../types/db/types';
import { Transaction } from '@op-engineering/op-sqlite';

const log = logger.create('RecordingsRepo');

function newRecordingId(): string {
  return `rec_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function mapRecordingRow(row: RecordingRow): Recording {
  return {
    id: row.id,
    bibleTextId: row.bible_text_id,
    localFilePath: row.local_file_path,
    blobKey: row.blob_key,
    durationMs: row.duration_ms,
    fileSizeBytes: row.file_size_bytes,
    takeNumber: row.take_number,
    isLatest: row.is_latest === 1,
    syncStatus: row.sync_status,
    uploadError: row.upload_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type AddRecordingTakeInput = {
  bibleTextId: number;
  localFilePath: string;
  durationMs?: number;
  fileSizeBytes?: number;
  /** Optional stable id (defaults to generated). */
  id?: string;
  syncStatus?: RecordingSyncStatus;
};

/**
 * Insert a new take for a verse: clear prior `is_latest`, bump `take_number`,
 * insert with `is_latest = 1` in one transaction.
 *
 * Linkage is verse-based (`bible_text_id`) — see #98 / #99. Shared-device
 * `(bible_text_id, user_id)` scoping lands with #105 once `user_id` exists on
 * `recordings` — until then latest is per verse.
 */
export async function addRecordingTake(
  input: AddRecordingTakeInput,
): Promise<string> {
  const db = getDatabase();
  const id = input.id ?? newRecordingId();
  const now = new Date().toISOString();
  const syncStatus = input.syncStatus ?? 'pending';

  await db.transaction(async (tx: Transaction) => {
    await tx.execute(
      `UPDATE recordings SET is_latest = 0, updated_at = ?
       WHERE bible_text_id = ? AND is_latest = 1`,
      [now, input.bibleTextId],
    );

    const maxResult = await tx.execute(
      `SELECT MAX(take_number) AS max_take FROM recordings WHERE bible_text_id = ?`,
      [input.bibleTextId],
    );
    const maxTake = Number(
      (maxResult.rows?.[0] as { max_take?: number | null } | undefined)
        ?.max_take ?? 0,
    );
    const takeNumber = maxTake + 1;

    await tx.execute(
      `INSERT INTO recordings (
         id, bible_text_id, local_file_path, duration_ms, file_size_bytes,
         take_number, is_latest, sync_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        id,
        input.bibleTextId,
        input.localFilePath,
        input.durationMs ?? null,
        input.fileSizeBytes ?? null,
        takeNumber,
        syncStatus,
        now,
        now,
      ],
    );
  });

  log.info('Recording take added', {
    id,
    bibleTextId: input.bibleTextId,
  });
  return id;
}

export async function getLatestRecordingForVerse(
  bibleTextId: number,
): Promise<Recording | null> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT * FROM recordings
     WHERE bible_text_id = ? AND is_latest = 1
     LIMIT 1`,
    [bibleTextId],
  );
  const row = result.rows?.[0] as unknown as RecordingRow | undefined;
  return row ? mapRecordingRow(row) : null;
}

export async function getTakesForVerse(
  bibleTextId: number,
): Promise<Recording[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT * FROM recordings
     WHERE bible_text_id = ?
     ORDER BY take_number ASC`,
    [bibleTextId],
  );
  const rows = (result.rows ?? []) as unknown as RecordingRow[];
  return rows.map(mapRecordingRow);
}

/**
 * Delete a take by id. If it was latest, promote the highest remaining
 * `take_number` for that verse (or leave none latest if empty).
 */
export async function deleteRecordingTake(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.transaction(async (tx: Transaction) => {
    const existing = await tx.execute(
      `SELECT bible_text_id, is_latest FROM recordings WHERE id = ?`,
      [id],
    );
    const row = existing.rows?.[0] as
      | { bible_text_id: number; is_latest: number }
      | undefined;
    if (!row) {
      return;
    }

    const wasLatest = row.is_latest === 1;
    const bibleTextId = row.bible_text_id;

    await tx.execute(`DELETE FROM recordings WHERE id = ?`, [id]);

    if (!wasLatest) {
      return;
    }

    const prior = await tx.execute(
      `SELECT id FROM recordings
       WHERE bible_text_id = ?
       ORDER BY take_number DESC
       LIMIT 1`,
      [bibleTextId],
    );
    const priorId = (prior.rows?.[0] as { id?: string } | undefined)?.id;
    if (priorId) {
      await tx.execute(
        `UPDATE recordings SET is_latest = 1, updated_at = ? WHERE id = ?`,
        [now, priorId],
      );
    }
  });

  log.info('Recording take deleted', { id });
}
