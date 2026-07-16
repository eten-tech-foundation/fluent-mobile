import { getDatabase } from './db';
import { logger } from '../utils/logger';
import { PrepareOfflineChapterRow } from '../types/prepareOffline/types';

const log = logger.create('DBQueriesPrepareOffline');

interface PrepareOfflineChapterDbRow {
  id: number;
  book_id: number;
  book_name: string;
  chapter_number: number;
  assigned_user_id: number | null;
}

function mapRow(row: PrepareOfflineChapterDbRow): PrepareOfflineChapterRow {
  return {
    id: row.id,
    bookId: row.book_id,
    bookName: row.book_name,
    chapterNumber: row.chapter_number,
    assignedUserId: row.assigned_user_id,
  };
}

/** Chapter assignments for a project, grouped downstream by book. */
export async function getPrepareOfflineChapters(
  projectId: number,
): Promise<PrepareOfflineChapterRow[]> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT
        ca.id,
        ca.book_id,
        ca.chapter_number,
        ca.assigned_user_id,
        b.eng_display_name AS book_name
      FROM chapter_assignments ca
      JOIN books b ON ca.book_id = b.id
      JOIN project_units pu ON ca.project_unit_id = pu.id
      WHERE pu.project_id = ?
      ORDER BY b.id, ca.chapter_number`,
      [Number(projectId)],
    );

    const rows =
      (result?.rows as unknown as PrepareOfflineChapterDbRow[]) || [];
    const chapters = rows.map(mapRow);

    log.info('Prepare offline chapters fetched', {
      projectId,
      count: chapters.length,
    });
    return chapters;
  } catch (error) {
    log.error('Error fetching prepare offline chapters', { error, projectId });
    throw error;
  }
}
