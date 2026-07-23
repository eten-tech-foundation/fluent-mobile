import { getDatabase } from './db';
import { logger } from '../utils/logger';
import * as DBTypes from '../types/db/types';
import { Transaction } from '@op-engineering/op-sqlite';

const log = logger.create('DBRepository');

async function insertLanguageTx(tx: Transaction, lang: DBTypes.Language) {
  await tx.execute(
    `INSERT OR IGNORE INTO languages
    (id, lang_name, lang_name_localized, lang_code_iso_639_3, script_direction)
    VALUES (?, ?, ?, ?, ?)`,
    [
      lang.id,
      lang.langName,
      lang.langNameLocalized ?? null,
      lang.langCode ?? null,
      lang.scriptDirection ?? 'ltr',
    ],
  );
  await tx.execute(
    `UPDATE languages SET
      lang_name = ?, lang_name_localized = ?,
      lang_code_iso_639_3 = ?, script_direction = ?
    WHERE id = ?`,
    [
      lang.langName,
      lang.langNameLocalized ?? null,
      lang.langCode ?? null,
      lang.scriptDirection ?? 'ltr',
      lang.id,
    ],
  );
}

async function insertBookTx(tx: Transaction, book: DBTypes.Book) {
  if (!book.eng_display_name) return;
  await tx.execute(
    `INSERT OR IGNORE INTO books (id, code, eng_display_name) VALUES (?, ?, ?)`,
    [book.id, book.code, book.eng_display_name],
  );
  await tx.execute(
    `UPDATE books SET code = ?, eng_display_name = ? WHERE id = ?`,
    [book.code, book.eng_display_name, book.id],
  );
}

async function insertBibleTx(tx: Transaction, bible: DBTypes.Bible) {
  if (!bible.name || !bible.abbreviation) return;
  await tx.execute(
    `INSERT OR IGNORE INTO bibles (id, language_id, name, abbreviation) VALUES (?, ?, ?, ?)`,
    [bible.id, bible.languageId, bible.name, bible.abbreviation],
  );
  await tx.execute(
    `UPDATE bibles SET language_id = ?, name = ?, abbreviation = ? WHERE id = ?`,
    [bible.languageId, bible.name, bible.abbreviation, bible.id],
  );
}

async function insertProjectUnitTx(
  tx: Transaction,
  unit: { id: number; projectId: number },
) {
  await tx.execute(
    `INSERT OR IGNORE INTO project_units (id, project_id, status) VALUES (?, ?, ?)`,
    [unit.id, unit.projectId, 'not_started'],
  );
  await tx.execute(`UPDATE project_units SET project_id = ? WHERE id = ?`, [
    unit.projectId,
    unit.id,
  ]);
}

async function insertChapterAssignmentTx(
  tx: Transaction,
  assignment: DBTypes.ChapterAssignment,
) {
  if (!assignment?.chapterAssignmentId) return;

  await tx.execute(
    `INSERT INTO chapter_assignments
    (id, project_unit_id, bible_id, book_id, chapter_number,
     assigned_user_id, peer_checker_id, status, submitted_time, updated_at,
     total_verses, completed_verses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_unit_id = excluded.project_unit_id,
      bible_id = excluded.bible_id,
      book_id = excluded.book_id,
      chapter_number = excluded.chapter_number,
      assigned_user_id = excluded.assigned_user_id,
      peer_checker_id = excluded.peer_checker_id,
      status = excluded.status,
      submitted_time = excluded.submitted_time,
      updated_at = excluded.updated_at,
      total_verses = MAX(chapter_assignments.total_verses, excluded.total_verses),
      completed_verses = excluded.completed_verses`,
    [
      assignment.chapterAssignmentId,
      assignment.projectUnitId,
      assignment.bibleId,
      assignment.bookId,
      assignment.chapterNumber,
      assignment.assignedUserId ?? null,
      assignment.peerCheckerId ?? null,
      assignment.chapterStatus ?? 'not_started',
      assignment.submittedTime ?? null,
      assignment.updatedAt ?? new Date().toISOString(),
      assignment.totalVerses ?? 0,
      assignment.completedVerses ?? 0,
    ],
  );
}

function getUniqueProjectUnits(assignments: DBTypes.ChapterAssignment[]) {
  const unitsMap = new Map<number, { id: number; projectId: number }>();

  for (const assignment of assignments) {
    if (!assignment.projectUnitId || !assignment.projectId) continue;
    if (unitsMap.has(assignment.projectUnitId)) continue;

    unitsMap.set(assignment.projectUnitId, {
      id: assignment.projectUnitId,
      projectId: assignment.projectId,
    });
  }

  return unitsMap;
}

export async function insertUser(user: DBTypes.User) {
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    await tx.execute(
      `INSERT OR IGNORE INTO users
      (id, username, email, first_name, last_name)
      VALUES (?, ?, ?, ?, ?)`,
      [
        user.id,
        user.username ?? null,
        user.email,
        user.firstName ?? null,
        user.lastName ?? null,
      ],
    );
    await tx.execute(
      `UPDATE users SET username = ?, email = ?, first_name = ?, last_name = ? WHERE id = ?`,
      [
        user.username ?? null,
        user.email,
        user.firstName ?? null,
        user.lastName ?? null,
        user.id,
      ],
    );
  });
}

export async function insertLanguages(data: DBTypes.Language[]) {
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    for (const lang of data) {
      await insertLanguageTx(tx, lang);
    }
  });
}

export async function insertBooks(data: DBTypes.Book[]) {
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    for (const book of data) {
      await insertBookTx(tx, book);
    }
  });
}

export async function insertBibles(data: DBTypes.Bible[]) {
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    for (const bible of data) {
      await insertBibleTx(tx, bible);
    }
  });
}

export async function insertMasterData(
  languages: DBTypes.Language[],
  books: DBTypes.Book[],
  bibles: DBTypes.Bible[],
) {
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    for (const lang of languages) {
      await insertLanguageTx(tx, lang);
    }
    for (const book of books) {
      await insertBookTx(tx, book);
    }
    for (const bible of bibles) {
      await insertBibleTx(tx, bible);
    }
  });
}

export async function insertProjects(data: DBTypes.Project[]) {
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    for (const project of data) {
      if (!project?.id || !project?.name) continue;

      const sourceLangId =
        project.sourceLanguageId ?? project.source_language_id;
      const targetLangId =
        project.targetLanguageId ?? project.target_language_id;

      if (!sourceLangId || !targetLangId) continue;

      await tx.execute(
        `INSERT OR IGNORE INTO projects
        (id, name, source_language_id, target_language_id, is_active, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          project.id,
          project.name,
          sourceLangId,
          targetLangId,
          project.isActive ? 1 : 0,
          project.status ?? 'not_assigned',
          project.updatedAt ?? new Date().toISOString(),
        ],
      );
      await tx.execute(
        `UPDATE projects SET
          name = ?, source_language_id = ?, target_language_id = ?,
          is_active = ?, status = ?, updated_at = ?
        WHERE id = ?`,
        [
          project.name,
          sourceLangId,
          targetLangId,
          project.isActive ? 1 : 0,
          project.status ?? 'not_assigned',
          project.updatedAt ?? new Date().toISOString(),
          project.id,
        ],
      );
    }
  });
}

export async function insertChapterAssignments(
  data: DBTypes.ChapterAssignment[],
) {
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    for (const assignment of data) {
      await insertChapterAssignmentTx(tx, assignment);
    }
  });
}

export async function insertProjectUnits(
  assignments: DBTypes.ChapterAssignment[],
) {
  const db = getDatabase();
  const unitsMap = getUniqueProjectUnits(assignments);

  if (unitsMap.size > 0) {
    await db.transaction(async (tx: Transaction) => {
      for (const unit of unitsMap.values()) {
        await insertProjectUnitTx(tx, unit);
      }
    });
  }
}

export async function insertChapterAssignmentSyncData(
  assignments: DBTypes.ChapterAssignment[],
) {
  const db = getDatabase();
  const unitsMap = getUniqueProjectUnits(assignments);

  log.info('insertChapterAssignmentSyncData', {
    assignmentsCount: assignments.length,
    unitsMapSize: unitsMap.size,
  });

  await db.transaction(async (tx: Transaction) => {
    for (const unit of unitsMap.values()) {
      await insertProjectUnitTx(tx, unit);
    }
    for (const assignment of assignments) {
      await insertChapterAssignmentTx(tx, assignment);
    }
  });
}

export async function getChaptersToSync() {
  const db = getDatabase();

  try {
    const result = await db.execute(`
      SELECT DISTINCT bible_id, book_id, chapter_number
      FROM chapter_assignments
      ORDER BY bible_id, book_id, chapter_number
    `);

    const rows = result.rows as unknown as DBTypes.ChapterRow[];

    const bibleGroups = new Map<
      number,
      Array<{ bookId: number; chapterNumber: number }>
    >();

    for (const row of rows) {
      if (!bibleGroups.has(row.bible_id)) {
        bibleGroups.set(row.bible_id, []);
      }
      bibleGroups.get(row.bible_id)!.push({
        bookId: row.book_id,
        chapterNumber: row.chapter_number,
      });
    }

    return bibleGroups;
  } catch (error) {
    log.error('Error getting chapters to sync:', { error });
    return new Map();
  }
}

export async function insertBibleTexts(data: DBTypes.BibleText[]) {
  const db = getDatabase();

  if (!data?.length) return;

  try {
    await db.transaction(async (tx: Transaction) => {
      for (const chapter of data) {
        await tx.execute(
          `DELETE FROM bible_texts
           WHERE bible_id = ? AND book_id = ? AND chapter_number = ?`,
          [chapter.bibleId, chapter.bookId, chapter.chapterNumber],
        );

        for (const verse of chapter.verses) {
          await tx.execute(
            `INSERT INTO bible_texts
            (bible_id, book_id, chapter_number, verse_number, text)
            VALUES (?, ?, ?, ?, ?)`,
            [
              verse.bible_id,
              verse.book_id,
              verse.chapter_number,
              verse.verse_number,
              verse.text,
            ],
          );
        }
      }
    });
  } catch (error) {
    log.error('Error inserting bible texts:', { error });
    throw error;
  }
}

export async function checkIfTextsSynced(
  bibleId: number,
  bookId: number,
  chapterNumber: number,
): Promise<boolean> {
  const db = getDatabase();

  try {
    const result = await db.execute(
      `SELECT COUNT(*) as count FROM bible_texts 
       WHERE bible_id = ? AND book_id = ? AND chapter_number = ?`,
      [bibleId, bookId, chapterNumber],
    );

    const rows = result.rows as unknown as DBTypes.CountRow[];
    return (rows[0]?.count ?? 0) > 0;
  } catch (error) {
    log.error('Error checking if texts synced:', { error });
    return false;
  }
}

export async function insertUserProjects(userId: number, projectIds: number[]) {
  if (projectIds.length === 0) return;

  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    for (const projectId of projectIds) {
      await tx.execute(
        `INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)`,
        [userId, projectId],
      );
    }
  });
}

/**
 * Repopulates user_projects when empty — e.g. after the membership table was
 * added or when chapter assignments synced before project membership rows.
 */
export async function ensureUserProjectMembership(
  userId: number,
): Promise<void> {
  const db = getDatabase();
  const countResult = await db.execute(
    'SELECT COUNT(*) as count FROM user_projects WHERE user_id = ?',
    [userId],
  );
  if (Number(countResult.rows?.[0]?.count ?? 0) > 0) {
    return;
  }

  const assignmentProjects = await db.execute(
    `SELECT DISTINCT pu.project_id AS project_id
     FROM chapter_assignments ca
     INNER JOIN project_units pu ON ca.project_unit_id = pu.id
     WHERE ca.assigned_user_id = ? OR ca.peer_checker_id = ?`,
    [userId, userId],
  );
  const projectIds = (
    (assignmentProjects.rows ?? []) as { project_id: number }[]
  )
    .map(row => row.project_id)
    .filter(id => Number.isFinite(id) && id > 0);

  if (projectIds.length === 0) {
    return;
  }

  log.info('Backfilling user_projects from chapter assignments', {
    userId,
    projectCount: projectIds.length,
  });
  await insertUserProjects(userId, projectIds);
}

export async function getLocalProjectIds(): Promise<number[]> {
  const db = getDatabase();
  try {
    const result = await db.execute('SELECT id FROM projects');
    const rows = result.rows as unknown as { id: number }[];
    return rows.map(r => r.id);
  } catch (error) {
    log.error('Error getting local project IDs:', { error });
    return [];
  }
}

export async function userHasLocalProjects(userId: number): Promise<boolean> {
  const db = getDatabase();
  const result = await db.execute(
    'SELECT COUNT(*) as count FROM user_projects WHERE user_id = ?',
    [userId],
  );
  return Number(result.rows?.[0]?.count ?? 0) > 0;
}

export async function userHasLocalChapterAssignments(
  userId: number,
): Promise<boolean> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT COUNT(*) as count
     FROM chapter_assignments ca
     INNER JOIN project_units pu ON pu.id = ca.project_unit_id
     INNER JOIN user_projects up ON up.project_id = pu.project_id
     WHERE up.user_id = ?
       AND (ca.assigned_user_id = ? OR ca.peer_checker_id = ?)`,
    [userId, userId, userId],
  );
  return Number(result.rows?.[0]?.count ?? 0) > 0;
}

/** Latest recordings not yet uploaded (`is_latest = 1 AND sync_status != 'uploaded'`). */
export async function getPendingRecordings(chapter?: {
  bookId: number;
  chapterNumber: number;
}): Promise<DBTypes.PendingRecording[]> {
  const db = getDatabase();
  const params: number[] = [];
  let chapterFilter = '';
  if (chapter) {
    chapterFilter = 'AND bt.book_id = ? AND bt.chapter_number = ?';
    params.push(chapter.bookId, chapter.chapterNumber);
  }

  const result = await db.execute(
    `SELECT
       r.id AS id,
       r.bible_text_id AS bible_text_id,
       r.local_file_path AS local_file_path,
       r.duration_ms AS duration_ms,
       bt.book_id AS book_id,
       bt.chapter_number AS chapter_number,
       (
         SELECT ca.project_unit_id
         FROM chapter_assignments ca
         WHERE ca.bible_id = bt.bible_id
           AND ca.book_id = bt.book_id
           AND ca.chapter_number = bt.chapter_number
         ORDER BY ca.id
         LIMIT 1
       ) AS project_unit_id
     FROM recordings r
     JOIN bible_texts bt ON bt.id = r.bible_text_id
     WHERE r.is_latest = 1
       AND r.sync_status != 'uploaded'
       ${chapterFilter}
     ORDER BY bt.book_id, bt.chapter_number, r.bible_text_id`,
    params,
  );

  const rows = result.rows ?? [];
  return rows.map(row => {
    const projectUnitRaw = row.project_unit_id;
    const projectUnitId =
      projectUnitRaw === null || projectUnitRaw === undefined
        ? null
        : Number(projectUnitRaw);
    const durationRaw = row.duration_ms;
    return {
      id: String(row.id),
      bibleTextId: Number(row.bible_text_id),
      localFilePath: String(row.local_file_path),
      durationMs:
        durationRaw === null || durationRaw === undefined
          ? null
          : Number(durationRaw),
      bookId: Number(row.book_id),
      chapterNumber: Number(row.chapter_number),
      projectUnitId:
        projectUnitId !== null && Number.isFinite(projectUnitId)
          ? projectUnitId
          : null,
    };
  });
}

export async function setRecordingSyncStatus(
  id: string,
  status: DBTypes.RecordingSyncStatus,
): Promise<void> {
  const db = getDatabase();
  const updatedAt = new Date().toISOString();
  await db.execute(
    `UPDATE recordings
     SET sync_status = ?, updated_at = ?
     WHERE id = ?`,
    [status, updatedAt, id],
  );
}

export async function markRecordingUploaded(
  id: string,
  blobKey: string,
): Promise<void> {
  const db = getDatabase();
  const updatedAt = new Date().toISOString();
  await db.execute(
    `UPDATE recordings
     SET sync_status = 'uploaded',
         blob_key = ?,
         upload_error = NULL,
         updated_at = ?
     WHERE id = ?`,
    [blobKey, updatedAt, id],
  );
}

export async function markRecordingFailed(
  id: string,
  uploadError: string,
): Promise<void> {
  const db = getDatabase();
  const updatedAt = new Date().toISOString();
  await db.execute(
    `UPDATE recordings
     SET sync_status = 'failed',
         upload_error = ?,
         updated_at = ?
     WHERE id = ?`,
    [uploadError, updatedAt, id],
  );
}

/** True when the user has project chapters locally but none have assignee/checker set. */
export async function userNeedsAssigneeRepair(
  userId: number,
): Promise<boolean> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(
         CASE
           WHEN ca.assigned_user_id IS NOT NULL OR ca.peer_checker_id IS NOT NULL THEN 1
           ELSE 0
         END
       ) AS with_role
     FROM chapter_assignments ca
     INNER JOIN project_units pu ON pu.id = ca.project_unit_id
     INNER JOIN user_projects up ON up.project_id = pu.project_id
     WHERE up.user_id = ?`,
    [userId],
  );
  const row = result.rows?.[0] as
    | { total: number; with_role: number }
    | undefined;
  const total = Number(row?.total ?? 0);
  const withRole = Number(row?.with_role ?? 0);
  return total > 0 && withRole === 0;
}

export {
  addRecordingTake,
  getLatestRecordingForVerse,
  getTakesForVerse,
  deleteRecordingTake,
} from './recordingsRepository';
export type { AddRecordingTakeInput } from './recordingsRepository';
