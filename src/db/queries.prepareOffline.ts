import { getDatabase } from './db';
import { logger } from '../utils/logger';
import {
  PrepareOfflineChapterRow,
  PrepareOfflineProjectContext,
} from '../types/prepareOffline/types';

const log = logger.create('DBQueriesPrepareOffline');

interface PrepareOfflineChapterDbRow {
  id: number;
  book_id: number;
  book_code: string;
  book_name: string;
  chapter_number: number;
  assigned_user_id: number | null;
}

function mapRow(row: PrepareOfflineChapterDbRow): PrepareOfflineChapterRow {
  return {
    id: row.id,
    bookId: row.book_id,
    bookCode: row.book_code,
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
        b.code AS book_code,
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

/** Source-language context needed by Aquifer resource lookup. */
export async function getPrepareOfflineProjectContext(
  projectId: number,
): Promise<PrepareOfflineProjectContext | null> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT
        p.id AS project_id,
        l.lang_code_iso_639_3 AS source_language_code
      FROM projects p
      JOIN languages l ON p.source_language_id = l.id
      WHERE p.id = ?
      LIMIT 1`,
      [Number(projectId)],
    );

    const row = result?.rows?.[0] as
      | { project_id?: number; source_language_code?: string | null }
      | undefined;
    const sourceLanguageCode = row?.source_language_code?.trim();
    if (!row?.project_id || !sourceLanguageCode) {
      return null;
    }

    return {
      projectId: row.project_id,
      sourceLanguageCode,
    };
  } catch (error) {
    log.error('Error fetching prepare offline project context', {
      error,
      projectId,
    });
    throw error;
  }
}

/** Project display names for storage-management accordions (#53). */
export async function getProjectNamesByIds(
  projectIds: number[],
): Promise<Map<number, string>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const db = getDatabase();
  const uniqueIds = [...new Set(projectIds.map(id => Number(id)))];
  const placeholders = uniqueIds.map(() => '?').join(', ');

  try {
    const result = await db.execute(
      `SELECT id, name FROM projects WHERE id IN (${placeholders})`,
      uniqueIds,
    );
    const rows =
      (result?.rows as unknown as Array<{ id: number; name: string }>) || [];
    const names = new Map<number, string>();
    for (const row of rows) {
      if (row?.id && row.name) {
        names.set(row.id, row.name);
      }
    }
    return names;
  } catch (error) {
    log.error('Error fetching project names for storage inventory', {
      error,
      projectIds: uniqueIds,
    });
    throw error;
  }
}
