import { getDatabase } from './db';

export async function getProjects() {
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
    return result?.rows || [];
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}

export async function getProjectUnits(projectId: string | number) {
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

export async function getChapterAssignmentById(id: string | number) {
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
      [Number(id)],
    );
    console.log('Chapter assignment by ID fetched:', result?.rows?.[0]);
    return result?.rows?.[0] || null;
  } catch (error) {
    console.error('Error fetching chapter assignment by ID:', error);
    return null;
  }
}

export async function getChapterAssignmentsWithBooks(
  projectUnitId: string | number,
) {
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
    return result?.rows || [];
  } catch (error) {
    console.error('Error fetching chapter assignments with books:', error);
    return [];
  }
}

export async function getBibleTexts(
  bibleId: string | number,
  bookId: string | number,
  chapterNumber: string | number,
) {
  const db = getDatabase();
  try {
    const result = await db.execute(
      'SELECT * FROM bible_texts WHERE bible_id = ? AND book_id = ? AND chapter_number = ? ORDER BY verse_number;',
      [Number(bibleId), Number(bookId), Number(chapterNumber)],
    );
    console.log('Bible texts fetched:', result?.rows?.length);
    return result?.rows || [];
  } catch (error) {
    console.error('Error fetching bible texts:', error);
    return [];
  }
}
