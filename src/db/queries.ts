import { getDatabase } from './db';
import { logger } from '../utils/logger';
import * as DBTypes from '../types/db/types';

const log = logger.create('DBQueries');

export async function getProjects(userId: number): Promise<DBTypes.Project[]> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT 
        p.id,
        p.name,
        p.source_language_id,
        p.target_language_id,
        p.is_active,
        p.status,
        p.updated_at,
        sl.lang_name AS source_language_name,
        tl.lang_name AS target_language_name
      FROM projects p
      INNER JOIN user_projects up ON up.project_id = p.id  -- ← scoped to user
      LEFT JOIN languages sl ON p.source_language_id = sl.id
      LEFT JOIN languages tl ON p.target_language_id = tl.id
      WHERE up.user_id = ?`,
      [userId],
    );
    return (result?.rows as unknown as DBTypes.Project[]) || [];
  } catch (error) {
    log.error('Error fetching projects', { error });
    return [];
  }
}

export async function getProjectUnits(projectId: number) {
  const db = getDatabase();
  try {
    const result = await db.execute(
      'SELECT * FROM project_units WHERE project_id = ?;',
      [Number(projectId)],
    );
    return result?.rows || [];
  } catch (error) {
    log.error('Error fetching project units', { error });
    return [];
  }
}

export async function getChapterAssignmentById(
  id: number,
): Promise<DBTypes.ChapterAssignmentData | null> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT 
        ca.id,
        ca.project_unit_id,
        ca.bible_id,
        ca.book_id,
        ca.chapter_number,
        ca.assigned_user_id,
        ca.status,
        ca.submitted_time,
        ca.updated_at,
        b.code as book_code,
        b.eng_display_name as book_name,
        bi.name as bible_name,
        bi.abbreviation as bible_abbreviation
      FROM chapter_assignments ca
      LEFT JOIN books b ON ca.book_id = b.id
      LEFT JOIN bibles bi ON ca.bible_id = bi.id
      WHERE ca.id = ?`,
      [id],
    );

    const row = (result?.rows as unknown as DBTypes.ChapterAssignmentRow[])?.at(
      0,
    );
    if (!row) return null;

    return {
      id: row.id,
      projectUnitId: row.project_unit_id,
      bibleId: row.bible_id,
      bookId: row.book_id,
      chapterNumber: row.chapter_number,
      assignedUserId: row.assigned_user_id,
      status: row.status,
      submittedTime: row.submitted_time ?? undefined,
      updatedAt: row.updated_at,
      bookCode: row.book_code,
      bookName: row.book_name,
      bibleName: row.bible_name,
      bibleAbbreviation: row.bible_abbreviation,
    };
  } catch (error) {
    log.error('Error fetching chapter assignment by ID:', { error });
    return null;
  }
}

export async function getChapterAssignmentsWithBooks(projectUnitId: number) {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT 
        ca.id,
        ca.chapter_number,
        ca.status,
        b.eng_display_name as book_name,
        ca.assigned_user_id
      FROM chapter_assignments ca
      LEFT JOIN books b ON ca.book_id = b.id
      WHERE ca.project_unit_id = ?
      ORDER BY b.id, ca.chapter_number`,
      [Number(projectUnitId)],
    );
    log.info('Chapter assignments with books fetched', {
      count: result?.rows?.length,
    });
    return (result?.rows as unknown as DBTypes.ChapterListItem[]) || [];
  } catch (error) {
    log.error('Error fetching chapter assignments with books:', { error });
    return [];
  }
}

export async function getBibleTexts(
  bibleId: number,
  bookId: number,
  chapterNumber: number,
): Promise<DBTypes.VerseData[]> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT
        bible_id,
        book_id,
        chapter_number,
        verse_number,
        text
      FROM bible_texts
      WHERE bible_id = ? AND book_id = ? AND chapter_number = ?
      ORDER BY verse_number`,
      [bibleId, bookId, chapterNumber],
    );

    const rows = (result?.rows as unknown as DBTypes.VerseRow[]) || [];

    return rows.map(row => ({
      bibleId: row.bible_id,
      bookId: row.book_id,
      chapterNumber: row.chapter_number,
      verseNumber: row.verse_number,
      text: row.text,
    }));
  } catch (error) {
    log.error('Error fetching bible texts', { error });
    return [];
  }
}

export interface MyWorkItem {
  id: number;
  chapter_number: number;
  status: string;
  book_name: string;
  assigned_user_id: number | null;
  peer_checker_id: number | null;
  project_name: string;
  target_language_name: string;
}

export async function getMyWorkAssignments(
  userId: number,
): Promise<MyWorkItem[]> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT
        ca.id,
        ca.chapter_number,
        ca.status,
        b.eng_display_name  AS book_name,
        ca.assigned_user_id,
        ca.peer_checker_id,
        p.name              AS project_name,
        tl.lang_name        AS target_language_name
      FROM chapter_assignments ca
      LEFT JOIN books         b  ON ca.book_id          = b.id
      LEFT JOIN project_units pu ON ca.project_unit_id  = pu.id
      LEFT JOIN projects      p  ON pu.project_id       = p.id
      LEFT JOIN languages     tl ON p.target_language_id = tl.id
      WHERE (ca.status = 'draft'        AND ca.assigned_user_id = ?)
         OR (ca.status = 'peer_checker' AND ca.peer_checker_id  = ?)
      ORDER BY p.name, b.id, ca.chapter_number`,
      [userId, userId],
    );
    return (result?.rows as unknown as MyWorkItem[]) || [];
  } catch (error) {
    log.error('Error fetching my work assignments', { error });
    return [];
  }
}

export async function getBibleTextId(
  bibleId: number,
  bookId: number,
  chapterNumber: number,
  verseNumber: number,
): Promise<number | null> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT id FROM bible_texts
       WHERE bible_id = ? AND book_id = ? AND chapter_number = ? AND verse_number = ?`,
      [bibleId, bookId, chapterNumber, verseNumber],
    );
    const rows = result?.rows as unknown as { id: number }[];
    return rows?.[0]?.id ?? null;
  } catch (error) {
    log.error('Error fetching bible text id', { error });
    return null;
  }
}
