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

function parseActiveUserId(raw: string): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Active account id for capture / latest-take scoping (#105). */
export function resolveRecordedByUserId(
  override?: number | null,
): number | null {
  if (override !== undefined) {
    return override;
  }
  // Lazy require keeps `repository`/`queries` loadable in unit tests that only
  // import SQL constants without pulling op-sqlite KV storage.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getActiveUserId } =
    require('../services/storage') as typeof import('../services/storage');
  return parseActiveUserId(getActiveUserId());
}

function mapRecordingRow(row: RecordingRow): Recording {
  return {
    id: row.id,
    bibleTextId: row.bible_text_id,
    recordedByUserId: row.recorded_by_user_id,
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

/** SQL predicate + params for optional recorded_by_user_id (incl. NULL). */
function recordedByClause(
  userId: number | null,
  column = 'recorded_by_user_id',
): { sql: string; params: (number | null)[] } {
  if (userId === null) {
    return { sql: `${column} IS NULL`, params: [] };
  }
  return { sql: `${column} = ?`, params: [userId] };
}

export type AddRecordingTakeInput = {
  bibleTextId: number;
  localFilePath: string;
  durationMs?: number;
  fileSizeBytes?: number;
  /** Optional stable id (defaults to generated). */
  id?: string;
  syncStatus?: RecordingSyncStatus;
  /**
   * Capture-time owner. Defaults to `getActiveUserId()`.
   * Pass `null` explicitly only in tests for legacy unattributed rows.
   */
  recordedByUserId?: number | null;
};

/**
 * Insert a new take for a verse: clear prior `is_latest` for this user, bump
 * per-user `take_number`, insert with `is_latest = 1` in one transaction.
 *
 * Linkage is verse-based (`bible_text_id`) — see #98 / #99. Shared-device
 * scoping is `(bible_text_id, recorded_by_user_id)` (#105).
 */
export async function addRecordingTake(
  input: AddRecordingTakeInput,
): Promise<string> {
  const db = getDatabase();
  const id = input.id ?? newRecordingId();
  const now = new Date().toISOString();
  const syncStatus = input.syncStatus ?? 'pending';
  const recordedByUserId = resolveRecordedByUserId(input.recordedByUserId);
  const owner = recordedByClause(recordedByUserId);

  await db.transaction(async (tx: Transaction) => {
    await tx.execute(
      `UPDATE recordings SET is_latest = 0, updated_at = ?
       WHERE bible_text_id = ? AND is_latest = 1 AND ${owner.sql}`,
      [now, input.bibleTextId, ...owner.params],
    );

    const maxResult = await tx.execute(
      `SELECT MAX(take_number) AS max_take FROM recordings
       WHERE bible_text_id = ? AND ${owner.sql}`,
      [input.bibleTextId, ...owner.params],
    );
    const maxTake = Number(
      (maxResult.rows?.[0] as { max_take?: number | null } | undefined)
        ?.max_take ?? 0,
    );
    const takeNumber = maxTake + 1;

    await tx.execute(
      `INSERT INTO recordings (
         id, bible_text_id, recorded_by_user_id, local_file_path, duration_ms,
         file_size_bytes, take_number, is_latest, sync_status, created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        id,
        input.bibleTextId,
        recordedByUserId,
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
    recordedByUserId,
  });
  return id;
}

export async function getLatestRecordingForVerse(
  bibleTextId: number,
  recordedByUserId?: number | null,
): Promise<Recording | null> {
  const db = getDatabase();
  const ownerId = resolveRecordedByUserId(recordedByUserId);
  const owner = recordedByClause(ownerId);
  const result = await db.execute(
    `SELECT * FROM recordings
     WHERE bible_text_id = ? AND is_latest = 1 AND ${owner.sql}
     LIMIT 1`,
    [bibleTextId, ...owner.params],
  );
  const row = result.rows?.[0] as unknown as RecordingRow | undefined;
  return row ? mapRecordingRow(row) : null;
}

export async function getTakesForVerse(
  bibleTextId: number,
  recordedByUserId?: number | null,
): Promise<Recording[]> {
  const db = getDatabase();
  const ownerId = resolveRecordedByUserId(recordedByUserId);
  const owner = recordedByClause(ownerId);
  const result = await db.execute(
    `SELECT * FROM recordings
     WHERE bible_text_id = ? AND ${owner.sql}
     ORDER BY take_number ASC`,
    [bibleTextId, ...owner.params],
  );
  const rows = (result.rows ?? []) as unknown as RecordingRow[];
  return rows.map(mapRecordingRow);
}

/**
 * Delete a take by id. If it was latest, promote the highest remaining
 * `take_number` for that verse + owner (or leave none latest if empty).
 */
export async function deleteRecordingTake(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.transaction(async (tx: Transaction) => {
    const existing = await tx.execute(
      `SELECT bible_text_id, recorded_by_user_id, is_latest
       FROM recordings WHERE id = ?`,
      [id],
    );
    const row = existing.rows?.[0] as
      | {
          bible_text_id: number;
          recorded_by_user_id: number | null;
          is_latest: number;
        }
      | undefined;
    if (!row) {
      return;
    }

    const wasLatest = row.is_latest === 1;
    const bibleTextId = row.bible_text_id;
    const owner = recordedByClause(row.recorded_by_user_id);

    await tx.execute(`DELETE FROM recordings WHERE id = ?`, [id]);

    if (!wasLatest) {
      return;
    }

    const prior = await tx.execute(
      `SELECT id FROM recordings
       WHERE bible_text_id = ? AND ${owner.sql}
       ORDER BY take_number DESC
       LIMIT 1`,
      [bibleTextId, ...owner.params],
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
