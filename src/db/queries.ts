import { getDatabase } from './db';
import * as DBTypes from '../types/dbTypes';

export async function getProjects(): Promise<DBTypes.Project[]> {
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
      LEFT JOIN languages sl ON p.source_language_id = sl.id
      LEFT JOIN languages tl ON p.target_language_id = tl.id;
      `,
    );

    console.log('Projects fetched:', result?.rows?.length);
    return (result?.rows as unknown as DBTypes.Project[]) || [];
  } catch (error) {
    console.error('Error fetching projects:', error);
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
    console.error('Error fetching project units:', error);
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
      assignedUserId: row.assigned_user_id ?? undefined,
      status: row.status,
      submittedTime: row.submitted_time ?? undefined,
      updatedAt: row.updated_at,
      bookName: row.book_name,
      bibleName: row.bible_name,
      bibleAbbreviation: row.bible_abbreviation,
    };
  } catch (error) {
    console.error('Error fetching chapter assignment by ID:', error);
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
    console.log(
      'Chapter assignments with books fetched:',
      result?.rows?.length,
    );
    return (result?.rows as unknown as DBTypes.ChapterListItem[]) || [];
  } catch (error) {
    console.error('Error fetching chapter assignments with books:', error);
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
    console.error('Error fetching bible texts:', error);
    return [];
  }
}
