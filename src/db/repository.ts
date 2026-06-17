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
    `INSERT OR REPLACE INTO chapter_assignments
    (id, project_unit_id, bible_id, book_id, chapter_number,
     assigned_user_id, peer_checker_id, status, submitted_time, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        for (const verse of chapter.verses) {
          await tx.execute(
            `INSERT OR REPLACE INTO bible_texts
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

function toRelativePath(absolutePath: string): string {
  const marker = '/Projects/';
  const idx = absolutePath.indexOf(marker);
  return idx !== -1 ? absolutePath.slice(idx + marker.length) : absolutePath;
}

export async function upsertRecording(data: {
  bibleTextId: number;
  projectUnitId: number;
  localPath: string;
  fileSize?: number;
}): Promise<void> {
  const db = getDatabase();
  const relativePath = toRelativePath(data.localPath);
  try {
    await db.execute(
      `INSERT INTO recordings
         (bible_text_id, project_unit_id, relative_path, sync_status, file_size, last_updated_at)
       VALUES (?, ?, ?, 'pending', ?, datetime('now'))
       ON CONFLICT(project_unit_id, bible_text_id) DO UPDATE SET
         relative_path   = excluded.relative_path,
         sync_status     = 'pending',
         file_size       = excluded.file_size,
         upload_error    = NULL,
         last_updated_at = datetime('now')`,
      [
        data.bibleTextId,
        data.projectUnitId,
        relativePath,
        data.fileSize ?? null,
      ],
    );
    log.info('Recording upserted', { relativePath });
  } catch (error) {
    log.error('Error upserting recording', { error });
    throw error;
  }
}

export async function deleteRecording(
  projectUnitId: number,
  bibleTextId: number,
): Promise<void> {
  const db = getDatabase();
  try {
    await db.execute(
      `DELETE FROM recordings
       WHERE project_unit_id = ? AND bible_text_id = ?`,
      [projectUnitId, bibleTextId],
    );
    log.info('Recording deleted from DB', { projectUnitId, bibleTextId });
  } catch (error) {
    log.error('Error deleting recording', { error });
  }
}

// ─── Recording sync helpers ───────────────────────────────────────────────────

export interface PendingRecording {
  id: number;
  bible_text_id: number;
  project_unit_id: number;
  relative_path: string;
  file_size: number | null;
  last_updated_at: string;
}

export async function getPendingRecordings(): Promise<PendingRecording[]> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT id, bible_text_id, project_unit_id, relative_path, file_size, last_updated_at
       FROM recordings
       WHERE sync_status = 'pending'
       ORDER BY last_updated_at ASC`,
    );
    return (result.rows ?? []) as unknown as PendingRecording[];
  } catch (error) {
    log.error('Error fetching pending recordings', { error });
    return [];
  }
}

/**
 * Updates the sync_status of a recording row after an upload attempt.
 *
 * @param id          SQLite row id of the recording.
 * @param status      'syncing' | 'synced' | 'failed'
 * @param uploadError Human-readable error message; set to null on success.
 */
export async function updateRecordingSyncStatus(
  id: number,
  status: 'syncing' | 'synced' | 'failed',
  uploadError?: string,
): Promise<void> {
  const db = getDatabase();
  try {
    await db.execute(
      `UPDATE recordings
       SET sync_status     = ?,
           upload_error    = ?,
           last_updated_at = datetime('now')
       WHERE id = ?`,
      [status, uploadError ?? null, id],
    );
  } catch (error) {
    log.error('Error updating recording sync status', { id, status, error });
    // Non-fatal — the upload already completed. State will self-correct on next sync.
  }
}
