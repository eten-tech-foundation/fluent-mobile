import { getDatabase } from './db';
import { logger } from '../utils/logger';
import type {
  Recording,
  RecordingRow,
  RecordingWithOwner,
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
    isSelected: row.is_selected === 1,
    isCanonical: row.is_canonical === 1,
    syncStatus: row.sync_status,
    uploadError: row.upload_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type OwnerJoinRow = RecordingRow & {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  email: string | null;
};

function resolveOwnerDisplayName(row: OwnerJoinRow): string {
  if (!row.email && row.recorded_by_user_id === null) return 'Unknown';
  const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (row.username) return row.username;
  return row.email ?? 'Unknown';
}

function mapRecordingWithOwnerRow(row: OwnerJoinRow): RecordingWithOwner {
  return {
    ...mapRecordingRow(row),
    ownerDisplayName: resolveOwnerDisplayName(row),
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
 * Insert a new take for a verse: clear prior `is_selected` for this user, bump
 * per-user `take_number`, insert with `is_selected = 1` in one transaction.
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
      `UPDATE recordings SET is_selected = 0, updated_at = ?
       WHERE bible_text_id = ? AND is_selected = 1 AND ${owner.sql}`,
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
         file_size_bytes, take_number, is_selected, sync_status, created_at,
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
     WHERE bible_text_id = ? AND is_selected = 1 AND ${owner.sql}
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

export async function getAllTakesForVerse(
  bibleTextId: number,
): Promise<RecordingWithOwner[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT r.*, u.first_name, u.last_name, u.username, u.email
     FROM recordings r
     LEFT JOIN users u ON u.id = r.recorded_by_user_id
     WHERE r.bible_text_id = ?
     ORDER BY r.recorded_by_user_id IS NOT NULL, r.recorded_by_user_id ASC, r.take_number ASC`,
    [bibleTextId],
  );
  const rows = (result.rows ?? []) as unknown as OwnerJoinRow[];
  return rows.map(mapRecordingWithOwnerRow);
}

export async function verseHasMultipleRecorders(
  bibleTextId: number,
): Promise<boolean> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT COUNT(DISTINCT COALESCE(recorded_by_user_id, -1)) AS cnt
     FROM recordings WHERE bible_text_id = ?`,
    [bibleTextId],
  );
  const cnt = Number(
    (result.rows?.[0] as { cnt?: number } | undefined)?.cnt ?? 0,
  );
  return cnt > 1;
}

export async function setCanonicalTake(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  let applied = false;

  await db.transaction(async (tx: Transaction) => {
    const existing = await tx.execute(
      `SELECT bible_text_id, is_canonical FROM recordings WHERE id = ?`,
      [id],
    );
    const row = existing.rows?.[0] as
      | { bible_text_id: number; is_canonical: number }
      | undefined;
    if (!row || row.is_canonical === 1) {
      return;
    }

    await tx.execute(
      `UPDATE recordings SET is_canonical = 0, updated_at = ?
       WHERE bible_text_id = ? AND is_canonical = 1`,
      [now, row.bible_text_id],
    );
    await tx.execute(
      `UPDATE recordings SET is_canonical = 1, updated_at = ? WHERE id = ?`,
      [now, id],
    );
    applied = true;
  });

  if (applied) {
    log.info('Canonical take designated', { id });
  }
}
/**
 * Mark an existing take as the active draft (`is_selected`), e.g. picking an
 * earlier take over the most recently recorded one. Clears `is_selected` for
 * every other take on that verse + owner, then sets it on `id`.
 *
 * No-ops (without error) if `id` doesn't exist, is already latest, or is
 * owned by a different user than the active account (#259) — so a stale
 * card tap racing `deleteRecordingTake`, or a cross-account id leak, can't
 * throw. Unattributed rows (`recorded_by_user_id = NULL`) are treated as
 * unowned and may be acted on by any active user.
 */
export async function selectRecordingTake(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  let applied = false;

  await db.transaction(async (tx: Transaction) => {
    const existing = await tx.execute(
      `SELECT bible_text_id, recorded_by_user_id, is_selected
       FROM recordings WHERE id = ?`,
      [id],
    );
    const row = existing.rows?.[0] as
      | {
          bible_text_id: number;
          recorded_by_user_id: number | null;
          is_selected: number;
        }
      | undefined;
    if (!row || row.is_selected === 1) {
      return;
    }

    const activeUserId = resolveRecordedByUserId();
    if (
      row.recorded_by_user_id !== null &&
      row.recorded_by_user_id !== activeUserId
    ) {
      log.warn('Ignored select on take owned by another user', {
        id,
        recordedByUserId: row.recorded_by_user_id,
        activeUserId,
      });
      return;
    }

    const owner = recordedByClause(row.recorded_by_user_id);

    await tx.execute(
      `UPDATE recordings SET is_selected = 0, updated_at = ?
       WHERE bible_text_id = ? AND is_selected = 1 AND ${owner.sql}`,
      [now, row.bible_text_id, ...owner.params],
    );
    await tx.execute(
      `UPDATE recordings SET is_selected = 1, updated_at = ? WHERE id = ?`,
      [now, id],
    );
    applied = true;
  });

  if (applied) {
    log.info('Recording take selected', { id });
  }
}

/**
 * Delete a take by id. If it was selected, promote the highest remaining
 * `take_number` for that verse + owner (or leave none latest if empty).
 *
 * No-ops (without error) if `id` doesn't exist or is owned by a different
 * user than the active account (#259). Unattributed rows
 * (`recorded_by_user_id = NULL`) are treated as unowned and may be deleted
 * by any active user.
 */
export async function deleteRecordingTake(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  let applied = false;

  await db.transaction(async (tx: Transaction) => {
    const existing = await tx.execute(
      `SELECT bible_text_id, recorded_by_user_id, is_selected
       FROM recordings WHERE id = ?`,
      [id],
    );
    const row = existing.rows?.[0] as
      | {
          bible_text_id: number;
          recorded_by_user_id: number | null;
          is_selected: number;
        }
      | undefined;
    if (!row) {
      return;
    }

    const activeUserId = resolveRecordedByUserId();
    if (
      row.recorded_by_user_id !== null &&
      row.recorded_by_user_id !== activeUserId
    ) {
      log.warn('Ignored delete on take owned by another user', {
        id,
        recordedByUserId: row.recorded_by_user_id,
        activeUserId,
      });
      return;
    }

    const wasSelected = row.is_selected === 1;
    const bibleTextId = row.bible_text_id;
    const owner = recordedByClause(row.recorded_by_user_id);

    await tx.execute(`DELETE FROM recordings WHERE id = ?`, [id]);
    applied = true;

    if (!wasSelected) {
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
        `UPDATE recordings SET is_selected = 1, updated_at = ? WHERE id = ?`,
        [now, priorId],
      );
    }
  });

  if (applied) {
    log.info('Recording take deleted', { id });
  }
}
