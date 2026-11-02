import { getDatabase } from './db';
import { emitRecordingDataChanged } from '../services/recordingDataEvents';
import { logger } from '../utils/logger';
import type {
  PendingRecordingDeletion,
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
  const projectUnitRaw = row.project_unit_id;
  const projectUnitId =
    projectUnitRaw === null || projectUnitRaw === undefined
      ? null
      : Number(projectUnitRaw);
  return {
    id: row.id,
    bibleTextId: row.bible_text_id,
    recordedByUserId: row.recorded_by_user_id,
    projectUnitId:
      projectUnitId !== null && Number.isFinite(projectUnitId)
        ? projectUnitId
        : null,
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

/**
 * SQL predicate + params scoping a write to one project unit (#613).
 * A concrete unit matches only that unit; `null` (legacy, pre-#613 rows) matches
 * only other `NULL` rows — never a different unit's takes — so recording the
 * same bible text in two units keeps one selected take per unit.
 */
function projectUnitClause(
  projectUnitId: number | null,
  column = 'project_unit_id',
): { sql: string; params: (number | null)[] } {
  if (projectUnitId === null) {
    return { sql: `${column} IS NULL`, params: [] };
  }
  return { sql: `${column} = ?`, params: [projectUnitId] };
}

function normalizeProjectUnitId(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * SQL resolving the project unit a take uploads to: the capture unit when
 * set, else the chapter's assignment unit only when exactly one unit is
 * assigned (never guess across units). `bt` must alias the take's
 * bible_texts row; `unitExpr` is the capture unit expression.
 * `unitExpr` is substituted three times, so each `?` inside it must be
 * bound three times, in order.
 */
export function uploadProjectUnitSql(unitExpr: string): string {
  return `CASE
         WHEN ${unitExpr} IS NOT NULL AND ${unitExpr} > 0
           THEN ${unitExpr}
         ELSE (
           SELECT ca.project_unit_id
           FROM chapter_assignments ca
           WHERE ca.bible_id = bt.bible_id
             AND ca.book_id = bt.book_id
             AND ca.chapter_number = bt.chapter_number
             AND (
               SELECT COUNT(DISTINCT ca2.project_unit_id)
               FROM chapter_assignments ca2
               WHERE ca2.bible_id = bt.bible_id
                 AND ca2.book_id = bt.book_id
                 AND ca2.chapter_number = bt.chapter_number
             ) = 1
           LIMIT 1
         )
       END`;
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
  /** Project unit the take was recorded in (#613). */
  projectUnitId?: number | null;
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
    /** Only takes in this unit are cleared (#613); `null` = legacy rows. */
    projectUnitId: number | null;
  },
  now: string,
): Promise<void> {
  const unit = projectUnitClause(incoming.projectUnitId, 'r.project_unit_id');
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
       AND ${unit.sql}
       AND anchor_bt.bible_id = incoming_bt.bible_id
       AND anchor_bt.book_id = incoming_bt.book_id`,
    [incoming.bibleTextId, ...owner.params, ...unit.params],
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
    // #701: a take deselected after a selection-only sync marker (pending
    // with bytes already on the server) goes back to 'uploaded' — only the
    // latest selection is sent. Pending takes without blob_key stay pending
    // (never uploaded); canonical keeps its own marker.
    await tx.execute(
      `UPDATE recordings
       SET is_selected = 0,
           sync_status = CASE
             WHEN sync_status = 'pending' AND blob_key IS NOT NULL AND is_canonical = 0
               THEN 'uploaded'
             ELSE sync_status
           END,
           updated_at = ?
       WHERE id = ?`,
      [now, row.id],
    );
  }
}

/**
 * Insert a new take for a verse: clear prior `is_selected` for this user **in
 * the same project unit** (#613; `NULL` unit matches only `NULL`), bump
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
    const projectUnitId = normalizeProjectUnitId(input.projectUnitId);
    await clearOverlappingSelectedTakes(
      tx,
      owner,
      { bibleTextId: input.bibleTextId, range, projectUnitId },
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
         id, bible_text_id, recorded_by_user_id, project_unit_id, local_file_path,
         duration_ms, file_size_bytes, take_number, is_selected, sync_status,
         created_at, updated_at, granularity, start_chapter, start_verse,
         end_chapter, end_verse
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.bibleTextId,
        recordedByUserId,
        projectUnitId,
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
  // New take means new pending upload — refresh every sync-status consumer
  // (headers, Sync page) without waiting for an upload session event (#530).
  emitRecordingDataChanged();
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
  projectUnitId?: number | null,
): Promise<Recording[]> {
  const db = getDatabase();
  const ownerId = resolveRecordedByUserId(recordedByUserId);
  const owner = recordedByClause(ownerId);
  const viewSql = view
    ? `AND (bible_text_id = ? OR ${pericopeCoversViewSql()})`
    : 'AND bible_text_id = ?';
  const viewParams = view ? [bibleTextId, bibleTextId] : [bibleTextId];
  // Prefer takes recorded in this unit; include null for pre-#613 rows (#613).
  const unitSql =
    projectUnitId !== null &&
    projectUnitId !== undefined &&
    Number.isFinite(projectUnitId)
      ? 'AND (project_unit_id IS NULL OR project_unit_id = ?)'
      : '';
  const unitParams =
    projectUnitId !== null &&
    projectUnitId !== undefined &&
    Number.isFinite(projectUnitId)
      ? [projectUnitId]
      : [];
  const result = await db.execute(
    `SELECT * FROM recordings
     WHERE ${owner.sql} ${viewSql} ${unitSql}
     ORDER BY ${view ? 'created_at ASC' : 'take_number ASC, created_at ASC'}`,
    [...owner.params, ...viewParams, ...unitParams],
  );
  const rows = (result.rows ?? []) as unknown as RecordingRow[];
  return rows.map(mapRecordingRow);
}

export async function getAllTakesForVerse(
  bibleTextId: number,
  view?: VerseTakeView,
  projectUnitId?: number | null,
): Promise<RecordingWithOwner[]> {
  const db = getDatabase();
  const viewSql = view
    ? `AND (r.bible_text_id = ? OR ${pericopeCoversViewSql('r')})`
    : 'AND r.bible_text_id = ?';
  const viewParams = view ? [bibleTextId, bibleTextId] : [bibleTextId];
  const unitSql =
    projectUnitId !== null &&
    projectUnitId !== undefined &&
    Number.isFinite(projectUnitId)
      ? 'AND (r.project_unit_id IS NULL OR r.project_unit_id = ?)'
      : '';
  const unitParams =
    projectUnitId !== null &&
    projectUnitId !== undefined &&
    Number.isFinite(projectUnitId)
      ? [projectUnitId]
      : [];
  const result = await db.execute(
    `SELECT r.*, u.first_name, u.last_name, u.username, u.email
     FROM recordings r
     LEFT JOIN users u ON u.id = r.recorded_by_user_id
     WHERE 1 = 1 ${viewSql} ${unitSql}
     ORDER BY r.recorded_by_user_id IS NOT NULL, r.recorded_by_user_id ASC, ${
       view ? 'r.created_at ASC' : 'r.take_number ASC'
     }`,
    [...viewParams, ...unitParams],
  );
  const rows = (result.rows ?? []) as unknown as OwnerJoinRow[];
  return rows.map(mapRecordingWithOwnerRow);
}

export async function verseHasMultipleRecorders(
  bibleTextId: number,
  recordedByUserId?: number | null,
  view?: VerseTakeView,
  projectUnitId?: number | null,
): Promise<boolean> {
  const db = getDatabase();
  const ownerId = resolveRecordedByUserId(recordedByUserId);
  const owner = recordedByClause(ownerId);
  const viewSql = view
    ? `AND (bible_text_id = ? OR ${pericopeCoversViewSql()})`
    : 'AND bible_text_id = ?';
  const viewParams = view ? [bibleTextId, bibleTextId] : [bibleTextId];
  // Match the take lists, including pre-#613 rows without a unit.
  const hasUnit =
    projectUnitId !== null &&
    projectUnitId !== undefined &&
    Number.isFinite(projectUnitId);
  const unitSql = hasUnit
    ? 'AND (project_unit_id IS NULL OR project_unit_id = ?)'
    : '';
  const result = await db.execute(
    `SELECT COUNT(*) AS cnt
     FROM recordings
     WHERE NOT (${owner.sql}) ${viewSql} ${unitSql}`,
    [...owner.params, ...viewParams, ...(hasUnit ? [projectUnitId] : [])],
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
      `SELECT bible_text_id, project_unit_id, is_canonical FROM recordings WHERE id = ?`,
      [id],
    );
    const row = existing.rows?.[0] as
      | {
          bible_text_id: number;
          project_unit_id?: number | null;
          is_canonical: number;
        }
      | undefined;
    if (!row || row.is_canonical === 1) {
      return;
    }

    // Canonical is per unit: another unit's canonical take on the same bible
    // text must stay canonical (#613).
    const unit = projectUnitClause(normalizeProjectUnitId(row.project_unit_id));
    // #701: the prior canonical take loses its selection-sync marker — with
    // the PM rule (canonical is what syncs as the selected take), its bytes
    // are on the server and a pending status would only re-send stale audio.
    await tx.execute(
      `UPDATE recordings
       SET is_canonical = 0,
           sync_status = CASE
             WHEN sync_status = 'pending' AND blob_key IS NOT NULL
               THEN 'uploaded'
             ELSE sync_status
           END,
           updated_at = ?
       WHERE bible_text_id = ? AND is_canonical = 1 AND ${unit.sql}`,
      [now, row.bible_text_id, ...unit.params],
    );
    // #701: designation alone is a change that must sync (replaces #279,
    // where canonical was sent only with the owning account's upload).
    // 'conflicted' / 'failed' are left for their own retry flows.
    await tx.execute(
      `UPDATE recordings
       SET is_canonical = 1,
           sync_status = CASE
             WHEN sync_status = 'uploaded' THEN 'pending'
             ELSE sync_status
           END,
           updated_at = ?
       WHERE id = ?`,
      [now, id],
    );
    // #701 PM rule: canonical wins the server's selected-take slot. Other
    // accounts' pending selection changes on this verse (+unit) are
    // superseded — with bytes already on the server they clear to 'uploaded'
    // instead of pending forever. Never-uploaded takes keep their marker
    // (their audio is still local) but are deferred by the upload queries.
    await tx.execute(
      `UPDATE recordings
       SET sync_status = 'uploaded',
           updated_at = ?
       WHERE bible_text_id = ? AND ${unit.sql}
         AND is_canonical = 0 AND is_selected = 1
         AND sync_status = 'pending' AND blob_key IS NOT NULL`,
      [now, row.bible_text_id, ...unit.params],
    );
    applied = true;
  });

  if (applied) {
    log.info('Canonical take designated', { id });
    // A designation can create a pending upload on its own (#701) — refresh
    // pending/failed counts everywhere immediately.
    emitRecordingDataChanged();
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
      `SELECT id, bible_text_id, recorded_by_user_id, is_selected, blob_key,
              start_chapter, start_verse, end_chapter, end_verse, project_unit_id
       FROM recordings WHERE id = ?`,
      [id],
    );
    const row = existing.rows?.[0] as
      | {
          id: string;
          bible_text_id: number;
          recorded_by_user_id: number | null;
          is_selected: number;
          blob_key: string | null;
          start_chapter: number | null;
          start_verse: number | null;
          end_chapter: number | null;
          end_verse: number | null;
          project_unit_id?: number | null;
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

    // #701 PM rule: the canonical take is what syncs as the server's
    // selected take. While this verse (+unit) has a canonical take, a
    // selection onto a take whose bytes are already on the server is
    // superseded — no sync marker. Never-uploaded takes keep their pending
    // marker (their audio still has to reach the server) but the upload
    // queries defer them until the canonical designation moves.
    const unit = projectUnitClause(normalizeProjectUnitId(row.project_unit_id));
    const canonicalRows = await tx.execute(
      `SELECT id FROM recordings
       WHERE bible_text_id = ? AND is_canonical = 1 AND ${unit.sql}
       LIMIT 1`,
      [row.bible_text_id, ...unit.params],
    );
    const selectionSupersededByCanonical =
      (canonicalRows.rows?.length ?? 0) > 0 && row.blob_key !== null;

    await clearOverlappingSelectedTakes(
      tx,
      owner,
      {
        id: row.id,
        bibleTextId: row.bible_text_id,
        range: rowRange(row),
        projectUnitId: normalizeProjectUnitId(row.project_unit_id),
      },
      now,
    );
    // #701: moving the selection onto an already-uploaded take marks it
    // pending so the next sync re-sends it and the server's active take
    // follows. 'conflicted' / 'failed' are left for their own retry flows.
    await tx.execute(
      selectionSupersededByCanonical
        ? `UPDATE recordings SET is_selected = 1, updated_at = ? WHERE id = ?`
        : `UPDATE recordings
       SET is_selected = 1,
           sync_status = CASE
             WHEN sync_status = 'uploaded' THEN 'pending'
             ELSE sync_status
           END,
           updated_at = ?
       WHERE id = ?`,
      [now, id],
    );
    applied = true;
  });

  if (applied) {
    log.info('Recording take selected', { id });
    // Counts filter on is_selected = 1, so selecting a take can change them.
    // Remove with the is_selected filter if all takes become uploadable.
    emitRecordingDataChanged();
  }
}

/** Server take deletes queued by `deleteRecordingTake` (#716), oldest first. */
export async function getPendingRecordingDeletions(): Promise<
  PendingRecordingDeletion[]
> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT id, project_unit_id, bible_text_id, server_take_id,
            recorded_by_user_id
     FROM recording_deletions
     ORDER BY created_at ASC, id ASC`,
  );
  return (
    (result.rows ?? []) as {
      id: string;
      project_unit_id: number;
      bible_text_id: number;
      server_take_id: number;
      recorded_by_user_id: number | null;
    }[]
  ).map(row => ({
    id: row.id,
    projectUnitId: Number(row.project_unit_id),
    bibleTextId: Number(row.bible_text_id),
    serverTakeId: Number(row.server_take_id),
    recordedByUserId:
      row.recorded_by_user_id === null ? null : Number(row.recorded_by_user_id),
  }));
}

/** Drop a queued server take delete once the server confirmed it (#716). */
export async function clearRecordingDeletion(id: string): Promise<void> {
  const db = getDatabase();
  await db.execute(`DELETE FROM recording_deletions WHERE id = ?`, [id]);
}

/**
 * Delete a take by id. If it was selected, promote the highest remaining
 * `take_number` for that verse + owner (or leave none latest if empty) and
 * mark that promotion pending so the server's active take follows — unless a
 * canonical take supersedes it on that verse (#701, same rule as
 * `selectRecordingTake`).
 *
 * A take the server already holds (`server_take_id` set) is queued in
 * `recording_deletions` so the next sync deletes the server copy (#716).
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
              start_chapter, start_verse, end_chapter, end_verse, project_unit_id,
              server_take_id
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
          project_unit_id?: number | null;
          server_take_id?: number | null;
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
    const unit = projectUnitClause(
      normalizeProjectUnitId(row.project_unit_id),
      'r.project_unit_id',
    );

    const serverTakeId = Number(row.server_take_id);
    if (Number.isInteger(serverTakeId) && serverTakeId > 0) {
      // #716: the server copy is removed on the next sync. The recording id
      // doubles as the queue id since the row is deleted below. No unit
      // resolves (ambiguous chapter assignment) means nothing to target.
      // Three copies: uploadProjectUnitSql substitutes the CAST(?) three times.
      const projectUnitId = normalizeProjectUnitId(row.project_unit_id);
      await tx.execute(
        `INSERT OR REPLACE INTO recording_deletions
           (id, project_unit_id, bible_text_id, server_take_id,
            recorded_by_user_id, created_at)
         SELECT ?, unit_id, ?, ?, ?, ?
         FROM (
           SELECT ${uploadProjectUnitSql('CAST(? AS INTEGER)')} AS unit_id
           FROM bible_texts bt WHERE bt.id = ?
         )
         WHERE unit_id IS NOT NULL`,
        [
          id,
          bibleTextId,
          serverTakeId,
          row.recorded_by_user_id,
          now,
          projectUnitId,
          projectUnitId,
          projectUnitId,
          bibleTextId,
        ],
      );
    }

    await tx.execute(`DELETE FROM recordings WHERE id = ?`, [id]);
    applied = true;

    if (!wasSelected) {
      return;
    }

    const candidates = await tx.execute(
      `SELECT r.id, r.bible_text_id, r.start_chapter, r.start_verse,
              r.end_chapter, r.end_verse, r.take_number, r.blob_key
       FROM recordings r
       INNER JOIN bible_texts anchor_bt ON anchor_bt.id = r.bible_text_id
       INNER JOIN bible_texts deleted_bt ON deleted_bt.id = ?
       WHERE anchor_bt.bible_id = deleted_bt.bible_id
         AND anchor_bt.book_id = deleted_bt.book_id
         AND ${owner.sql.replaceAll(
           'recorded_by_user_id',
           'r.recorded_by_user_id',
         )}
         AND ${unit.sql}`,
      [bibleTextId, ...owner.params, ...unit.params],
    );
    const promoted = (
      (candidates.rows ?? []) as {
        id: string;
        bible_text_id: number;
        start_chapter: number | null;
        start_verse: number | null;
        end_chapter: number | null;
        end_verse: number | null;
        take_number: number;
        blob_key: string | null;
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
      .sort((a, b) => b.take_number - a.take_number)[0];
    if (promoted) {
      // #701 PM rule (mirrors selectRecordingTake): while the promoted
      // take's verse (+unit) has a canonical take, canonical is what syncs
      // as the server's selected take — promoting an already-uploaded take
      // adds no sync marker of its own. Otherwise flip 'uploaded' →
      // 'pending' so the next sync re-sends it as the active take.
      const canonUnit = projectUnitClause(
        normalizeProjectUnitId(row.project_unit_id),
      );
      const canonicalRows = await tx.execute(
        `SELECT id FROM recordings
         WHERE bible_text_id = ? AND is_canonical = 1 AND ${canonUnit.sql}
         LIMIT 1`,
        [promoted.bible_text_id, ...canonUnit.params],
      );
      const selectionSupersededByCanonical =
        (canonicalRows.rows?.length ?? 0) > 0 && promoted.blob_key !== null;

      await tx.execute(
        selectionSupersededByCanonical
          ? `UPDATE recordings SET is_selected = 1, updated_at = ? WHERE id = ?`
          : `UPDATE recordings
       SET is_selected = 1,
           sync_status = CASE
             WHEN sync_status = 'uploaded' THEN 'pending'
             ELSE sync_status
           END,
           updated_at = ?
       WHERE id = ?`,
        [now, promoted.id],
      );
    }
  });

  if (applied) {
    log.info('Recording take deleted', { id });
    // Deleting a pending/failed take must drop the pending/failed header
    // state everywhere immediately (#530 A.1/A.2).
    emitRecordingDataChanged();
  }
}
