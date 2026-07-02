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

export interface InsertRecordingInput {
  id: string;
  bibleTextId: number;
  localFilePath: string;
  durationMs?: number | null;
  fileSizeBytes?: number | null;
  syncStatus?: DBTypes.RecordingSyncStatus;
  createdAt?: string;
}

interface MaxTakeRow {
  max_take: number | null;
}

/**
 * Inserts a new recording as the latest take for a verse, demoting any prior
 * `is_latest = 1` rows. Wrapped in a transaction so callers observe the row
 * count atomically; upload is deferred to a future ticket.
 */
export async function insertRecording(
  input: InsertRecordingInput,
): Promise<DBTypes.Recording> {
  const db = getDatabase();
  const now = input.createdAt ?? new Date().toISOString();
  const syncStatus = input.syncStatus ?? 'pending';

  let takeNumber = 1;

  await db.transaction(async (tx: Transaction) => {
    const takeResult = await tx.execute(
      `SELECT COALESCE(MAX(take_number), 0) AS max_take
         FROM recordings WHERE bible_text_id = ?`,
      [input.bibleTextId],
    );
    const rows = takeResult.rows as unknown as MaxTakeRow[];
    takeNumber = (rows?.[0]?.max_take ?? 0) + 1;

    await tx.execute(
      `UPDATE recordings SET is_latest = 0, updated_at = ?
         WHERE bible_text_id = ? AND is_latest = 1`,
      [now, input.bibleTextId],
    );

    await tx.execute(
      `INSERT INTO recordings
        (id, bible_text_id, local_file_path, duration_ms, file_size_bytes,
         take_number, is_latest, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        input.id,
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

  log.info('Recording inserted', {
    id: input.id,
    bibleTextId: input.bibleTextId,
    takeNumber,
  });

  return {
    id: input.id,
    bibleTextId: input.bibleTextId,
    localFilePath: input.localFilePath,
    durationMs: input.durationMs ?? null,
    fileSizeBytes: input.fileSizeBytes ?? null,
    takeNumber,
    isLatest: true,
    syncStatus,
    createdAt: now,
    updatedAt: now,
  };
}

/** Deletes a recording row by id; caller unlinks the audio file separately. */
export async function deleteRecordingById(id: string): Promise<void> {
  const db = getDatabase();
  await db.execute(`DELETE FROM recordings WHERE id = ?`, [id]);
  log.info('Recording deleted', { id });
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
