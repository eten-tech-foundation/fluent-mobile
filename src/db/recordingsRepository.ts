import { getDatabase } from './db';
import { logger } from '../utils/logger';
import type {
  Recording,
  RecordingGranularity,
  RecordingRow,
  RecordingWithOwner,
  RecordingSyncStatus,
} from '../types/db/types';
import { Transaction } from '@op-engineering/op-sqlite';
import {
  rangesOverlap,
  shouldClearSelectionForIncomingTake,
  type RecordingVerseRange,
} from '../utils/recordingRange';

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
  const granularity: RecordingGranularity =
    row.granularity === 'pericope' ? 'pericope' : 'verse';
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
    versionToken: row.version_token,
    uploadError: row.upload_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    granularity,
    startChapter: Number(row.start_chapter ?? 0),
    startVerse: Number(row.start_verse ?? 0),
    endChapter: Number(row.end_chapter ?? 0),
    endVerse: Number(row.end_verse ?? 0),
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

export type VerseTakeView = {
  chapterNumber: number;
  verseNumber: number;
};

export type AddRecordingTakeInput = {
  bibleTextId: number;
  /** Verse view where capture happened — scopes take_number across mixed takes (#410). */
  viewBibleTextId?: number;
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
  granularity?: RecordingGranularity;
  startChapter?: number;
  startVerse?: number;
  endChapter?: number;
  endVerse?: number;
};

function rangeFromInput(input: AddRecordingTakeInput): RecordingVerseRange {
  return {
    startChapter: input.startChapter ?? 0,
    startVerse: input.startVerse ?? 0,
    endChapter: input.endChapter ?? input.startChapter ?? 0,
    endVerse: input.endVerse ?? input.startVerse ?? 0,
  };
}

function rowRange(row: {
  start_chapter?: number | null;
  start_verse?: number | null;
  end_chapter?: number | null;
  end_verse?: number | null;
}): RecordingVerseRange {
  return {
    startChapter: Number(row.start_chapter ?? 0),
    startVerse: Number(row.start_verse ?? 0),
    endChapter: Number(row.end_chapter ?? 0),
    endVerse: Number(row.end_verse ?? 0),
  };
}

/** Match pericope takes whose anchor shares bible/book with `view_bt.id`. */
function pericopeCoversViewSql(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `(
    ${p}granularity = 'pericope'
    AND EXISTS (
      SELECT 1
      FROM bible_texts anchor_bt
      INNER JOIN bible_texts view_bt ON view_bt.id = ?
      WHERE anchor_bt.id = ${p}bible_text_id
        AND anchor_bt.bible_id = view_bt.bible_id
        AND anchor_bt.book_id = view_bt.book_id
        AND (${p}start_chapter < view_bt.chapter_number
          OR (${p}start_chapter = view_bt.chapter_number AND ${p}start_verse <= view_bt.verse_number))
        AND (${p}end_chapter > view_bt.chapter_number
          OR (${p}end_chapter = view_bt.chapter_number AND ${p}end_verse >= view_bt.verse_number))
    )
  )`;
}

async function maxTakeNumberAtView(
  tx: Transaction,
  owner: { sql: string; params: (number | null)[] },
  viewBibleTextId: number,
): Promise<number> {
  const result = await tx.execute(
    `SELECT MAX(take_number) AS max_take
     FROM recordings
     WHERE ${owner.sql}
       AND (bible_text_id = ? OR ${pericopeCoversViewSql()})`,
    [...owner.params, viewBibleTextId, viewBibleTextId],
  );
  return Number(
    (result.rows?.[0] as { max_take?: number | null } | undefined)?.max_take ??
      0,
  );
}

async function clearOverlappingSelectedTakes(
  tx: Transaction,
  owner: { sql: string; params: (number | null)[] },
  incoming: {
    id?: string;
    bibleTextId: number;
    range: RecordingVerseRange;
  },
  now: string,
): Promise<void> {
  const selected = await tx.execute(
    `SELECT r.id, r.bible_text_id, r.start_chapter, r.start_verse, r.end_chapter, r.end_verse
     FROM recordings r
     INNER JOIN bible_texts incoming_bt ON incoming_bt.id = ?
     INNER JOIN bible_texts anchor_bt ON anchor_bt.id = r.bible_text_id
     WHERE r.is_selected = 1
       AND ${owner.sql.replaceAll(
         'recorded_by_user_id',
         'r.recorded_by_user_id',
       )}
       AND anchor_bt.bible_id = incoming_bt.bible_id
       AND anchor_bt.book_id = incoming_bt.book_id`,
    [incoming.bibleTextId, ...owner.params],
  );
  const rows = (selected.rows ?? []) as unknown as {
    id: string;
    bible_text_id: number;
    start_chapter: number | null;
    start_verse: number | null;
    end_chapter: number | null;
    end_verse: number | null;
  }[];
  for (const row of rows) {
    if (
      !shouldClearSelectionForIncomingTake(
        {
          id: row.id,
          bibleTextId: row.bible_text_id,
          range: rowRange(row),
        },
        incoming,
      )
    ) {
      continue;
    }
    await tx.execute(
      `UPDATE recordings SET is_selected = 0, updated_at = ? WHERE id = ?`,
      [now, row.id],
    );
  }
}

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
    const range = rangeFromInput(input);
    const granularity: RecordingGranularity = input.granularity ?? 'verse';
    await clearOverlappingSelectedTakes(
      tx,
      owner,
      { bibleTextId: input.bibleTextId, range },
      now,
    );

    let maxTake = 0;
    if (input.viewBibleTextId !== null && input.viewBibleTextId !== undefined) {
      maxTake = await maxTakeNumberAtView(tx, owner, input.viewBibleTextId);
    } else {
      const maxResult = await tx.execute(
        `SELECT MAX(take_number) AS max_take FROM recordings
         WHERE bible_text_id = ? AND ${owner.sql}`,
        [input.bibleTextId, ...owner.params],
      );
      maxTake = Number(
        (maxResult.rows?.[0] as { max_take?: number | null } | undefined)
          ?.max_take ?? 0,
      );
    }
    const takeNumber = maxTake + 1;

    await tx.execute(
      `INSERT INTO recordings (
         id, bible_text_id, recorded_by_user_id, local_file_path, duration_ms,
         file_size_bytes, take_number, is_selected, sync_status, created_at,
         updated_at, granularity, start_chapter, start_verse, end_chapter, end_verse
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        granularity,
        range.startChapter,
        range.startVerse,
        range.endChapter,
        range.endVerse,
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
  view?: VerseTakeView,
): Promise<Recording[]> {
  const db = getDatabase();
  const ownerId = resolveRecordedByUserId(recordedByUserId);
  const owner = recordedByClause(ownerId);
  const viewSql = view
    ? `AND (bible_text_id = ? OR ${pericopeCoversViewSql()})`
    : 'AND bible_text_id = ?';
  const viewParams = view ? [bibleTextId, bibleTextId] : [bibleTextId];
  const result = await db.execute(
    `SELECT * FROM recordings
     WHERE ${owner.sql} ${viewSql}
     ORDER BY ${view ? 'created_at ASC' : 'take_number ASC, created_at ASC'}`,
    [...owner.params, ...viewParams],
  );
  const rows = (result.rows ?? []) as unknown as RecordingRow[];
  return rows.map(mapRecordingRow);
}

export async function getAllTakesForVerse(
  bibleTextId: number,
  view?: VerseTakeView,
): Promise<RecordingWithOwner[]> {
  const db = getDatabase();
  const viewSql = view
    ? `AND (r.bible_text_id = ? OR ${pericopeCoversViewSql('r')})`
    : 'AND r.bible_text_id = ?';
  const viewParams = view ? [bibleTextId, bibleTextId] : [bibleTextId];
  const result = await db.execute(
    `SELECT r.*, u.first_name, u.last_name, u.username, u.email
     FROM recordings r
     LEFT JOIN users u ON u.id = r.recorded_by_user_id
     WHERE 1 = 1 ${viewSql}
     ORDER BY r.recorded_by_user_id IS NOT NULL, r.recorded_by_user_id ASC, ${
       view ? 'r.created_at ASC' : 'r.take_number ASC'
     }`,
    viewParams,
  );
  const rows = (result.rows ?? []) as unknown as OwnerJoinRow[];
  return rows.map(mapRecordingWithOwnerRow);
}

export async function verseHasMultipleRecorders(
  bibleTextId: number,
  recordedByUserId?: number | null,
  view?: VerseTakeView,
): Promise<boolean> {
  const db = getDatabase();
  const ownerId = resolveRecordedByUserId(recordedByUserId);
  const owner = recordedByClause(ownerId);
  const viewSql = view
    ? `AND (bible_text_id = ? OR ${pericopeCoversViewSql()})`
    : 'AND bible_text_id = ?';
  const viewParams = view ? [bibleTextId, bibleTextId] : [bibleTextId];
  const result = await db.execute(
    `SELECT COUNT(*) AS cnt
     FROM recordings
     WHERE NOT (${owner.sql}) ${viewSql}`,
    [...owner.params, ...viewParams],
  );
  const cnt = Number(
    (result.rows?.[0] as { cnt?: number } | undefined)?.cnt ?? 0,
  );
  return cnt > 0;
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
      `SELECT id, bible_text_id, recorded_by_user_id, is_selected,
              start_chapter, start_verse, end_chapter, end_verse
       FROM recordings WHERE id = ?`,
      [id],
    );
    const row = existing.rows?.[0] as
      | {
          id: string;
          bible_text_id: number;
          recorded_by_user_id: number | null;
          is_selected: number;
          start_chapter: number | null;
          start_verse: number | null;
          end_chapter: number | null;
          end_verse: number | null;
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

    await clearOverlappingSelectedTakes(
      tx,
      owner,
      {
        id: row.id,
        bibleTextId: row.bible_text_id,
        range: rowRange(row),
      },
      now,
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
      `SELECT bible_text_id, recorded_by_user_id, is_selected,
              start_chapter, start_verse, end_chapter, end_verse
       FROM recordings WHERE id = ?`,
      [id],
    );
    const row = existing.rows?.[0] as
      | {
          bible_text_id: number;
          recorded_by_user_id: number | null;
          is_selected: number;
          start_chapter: number | null;
          start_verse: number | null;
          end_chapter: number | null;
          end_verse: number | null;
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
    const deletedRange = rowRange(row);
    const owner = recordedByClause(row.recorded_by_user_id);

    await tx.execute(`DELETE FROM recordings WHERE id = ?`, [id]);
    applied = true;

    if (!wasSelected) {
      return;
    }

    const candidates = await tx.execute(
      `SELECT r.id, r.bible_text_id, r.start_chapter, r.start_verse,
              r.end_chapter, r.end_verse, r.take_number
       FROM recordings r
       INNER JOIN bible_texts anchor_bt ON anchor_bt.id = r.bible_text_id
       INNER JOIN bible_texts deleted_bt ON deleted_bt.id = ?
       WHERE anchor_bt.bible_id = deleted_bt.bible_id
         AND anchor_bt.book_id = deleted_bt.book_id
         AND ${owner.sql.replaceAll(
           'recorded_by_user_id',
           'r.recorded_by_user_id',
         )}`,
      [bibleTextId, ...owner.params],
    );
    const priorId = (
      (candidates.rows ?? []) as {
        id: string;
        bible_text_id: number;
        start_chapter: number | null;
        start_verse: number | null;
        end_chapter: number | null;
        end_verse: number | null;
        take_number: number;
      }[]
    )
      .filter(candidate =>
        rangesOverlap(
          deletedRange,
          rowRange({
            start_chapter: candidate.start_chapter,
            start_verse: candidate.start_verse,
            end_chapter: candidate.end_chapter,
            end_verse: candidate.end_verse,
          }),
        ),
      )
      .sort((a, b) => b.take_number - a.take_number)[0]?.id;
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
