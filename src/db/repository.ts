import { getDatabase } from './db';
import * as DBTypes from '../types/dbTypes';
import { Transaction } from '@op-engineering/op-sqlite';

export async function insertUser(user: DBTypes.User) {
  const db = getDatabase();

  try {
    await db.execute(
      `INSERT OR REPLACE INTO users 
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
  } catch (error) {
    console.error('Error inserting user:', error);
  }
}

export async function insertLanguages(data: DBTypes.Language[]) {
  const db = getDatabase();

  await db.transaction(async (tx: Transaction) => {
    for (const lang of data) {
      await tx.execute(
        `INSERT OR REPLACE INTO languages 
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
    }
  });
}

export async function insertBooks(data: DBTypes.Book[]) {
  const db = getDatabase();

  await db.transaction(async (tx: Transaction) => {
    for (const book of data) {
      if (!book.eng_display_name) continue;

      await tx.execute(
        `INSERT OR REPLACE INTO books 
        (id, code, eng_display_name)
        VALUES (?, ?, ?)`,
        [book.id, book.code, book.eng_display_name],
      );
    }
  });
}

export async function insertBibles(data: DBTypes.Bible[]) {
  const db = getDatabase();

  await db.transaction(async (tx: Transaction) => {
    for (const bible of data) {
      if (!bible.name || !bible.abbreviation) continue;

      await tx.execute(
        `INSERT OR REPLACE INTO bibles 
        (id, language_id, name, abbreviation)
        VALUES (?, ?, ?, ?)`,
        [bible.id, bible.languageId, bible.name, bible.abbreviation],
      );
    }
  });
}

export async function insertProjects(data: DBTypes.Project[]) {
  const db = getDatabase();

  await db.transaction(async (tx: Transaction) => {
    for (const project of data) {
      if (!project?.id || !project?.name) continue;

      const sourceLangId = project.sourceLanguageId ?? project.sourceLanguageId;
      const targetLangId = project.targetLanguageId ?? project.targetLanguageId;

      if (!sourceLangId || !targetLangId) continue;

      await tx.execute(
        `INSERT OR REPLACE INTO projects 
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
    }
  });
}

export async function insertChapterAssignments(
  data: DBTypes.ChapterAssignment[],
) {
  const db = getDatabase();

  await db.transaction(async (tx: Transaction) => {
    for (const assignment of data) {
      if (!assignment?.chapterAssignmentId) continue;

      await tx.execute(
        `INSERT OR REPLACE INTO chapter_assignments 
        (id, project_unit_id, bible_id, book_id, chapter_number, 
         assigned_user_id, status, submitted_time, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assignment.chapterAssignmentId,
          assignment.projectUnitId,
          assignment.bibleId,
          assignment.bookId,
          assignment.chapterNumber,
          assignment.assignedUserId ?? null,
          assignment.chapterStatus ?? 'not_started',
          assignment.submittedTime ?? null,
          assignment.updatedAt ?? new Date().toISOString(),
        ],
      );
    }
  });
}

export async function insertProjectUnits(
  assignments: DBTypes.ChapterAssignment[],
) {
  const db = getDatabase();

  const unitsMap = new Map<number, { id: number; projectId: number }>();

  for (const assignment of assignments) {
    if (!assignment.projectUnitId || !assignment.projectId) continue;
    if (unitsMap.has(assignment.projectUnitId)) continue;

    unitsMap.set(assignment.projectUnitId, {
      id: assignment.projectUnitId,
      projectId: assignment.projectId,
    });
  }

  if (unitsMap.size > 0) {
    await db.transaction(async (tx: Transaction) => {
      for (const unit of unitsMap.values()) {
        await tx.execute(
          `INSERT OR REPLACE INTO project_units 
          (id, project_id, status)
          VALUES (?, ?, ?)`,
          [unit.id, unit.projectId, 'not_started'],
        );
      }
    });
  }
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
    console.error('Error getting chapters to sync:', error);
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
    console.error('Error inserting bible texts:', error);
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
    console.error('Error checking if texts synced:', error);
    return false;
  }
}
