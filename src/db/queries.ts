import { getDatabase } from './db';
import { ensureUserProjectMembership } from './repository';
import { logger } from '../utils/logger';
import * as DBTypes from '../types/db/types';
import { deriveChapterSyncState } from '../utils/chapterSyncState';
import {
  formatLastActivity,
  pickLastActivityIso,
} from '../utils/formatLastActivity';
import { deriveProjectSyncState } from '../utils/projectSyncState';
import {
  getMyWorkChapterQueryParams,
  MY_WORK_CHAPTER_WHERE,
} from '../utils/myWorkChapterFilter';
import { getBadgeStage, getWorkflowStage } from '../utils/workflowStage';

const log = logger.create('DBQueries');

const BIBLE_TEXTS_MATCH_CA = `
  bt.bible_id = ca.bible_id
  AND bt.book_id = ca.book_id
  AND bt.chapter_number = ca.chapter_number
`;

/** Recordings are keyed by bible_text_id; join verses for the chapter assignment. */
const RECORDINGS_JOIN_CA = `
  LEFT JOIN bible_texts bt_r
    ON bt_r.bible_id = ca.bible_id
    AND bt_r.book_id = ca.book_id
    AND bt_r.chapter_number = ca.chapter_number
  LEFT JOIN recordings r ON r.bible_text_id = bt_r.id AND r.is_latest = 1`;

const RECORDING_AGGREGATES = `
  COUNT(DISTINCT CASE WHEN r.id IS NOT NULL AND r.is_latest = 1 THEN r.id END) AS recording_count,
  COUNT(DISTINCT CASE
    WHEN r.id IS NOT NULL AND r.is_latest = 1 AND r.sync_status != 'uploaded' THEN r.id
  END) AS pending_count,
  MAX(CASE WHEN r.is_latest = 1 THEN r.updated_at END) AS last_recording_activity`;

function mapProjectSummaryRow(
  row: DBTypes.ProjectSummaryRow,
): DBTypes.ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    source_language_id: row.source_language_id,
    target_language_id: row.target_language_id,
    source_language_name: row.source_language_name,
    target_language_name: row.target_language_name,
    isActive: Boolean(row.is_active),
    status: row.status,
    updatedAt: row.updated_at,
    chapterCount: Number(row.chapter_count) || 0,
    syncState: deriveProjectSyncState(
      Number(row.recording_count) || 0,
      Number(row.pending_count) || 0,
    ),
  };
}

export async function getProjectsWithSummary(
  userId: number,
): Promise<DBTypes.ProjectSummary[]> {
  const db = getDatabase();
  try {
    await ensureUserProjectMembership(userId);

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
        tl.lang_name AS target_language_name,
        COUNT(DISTINCT ca.id) AS chapter_count,
        COUNT(DISTINCT CASE WHEN r.id IS NOT NULL THEN r.id END) AS recording_count,
        COUNT(DISTINCT CASE
          WHEN r.id IS NOT NULL AND r.sync_status != 'uploaded' THEN r.id
        END) AS pending_count
      FROM projects p
      INNER JOIN user_projects up ON up.project_id = p.id
      LEFT JOIN languages sl ON p.source_language_id = sl.id
      LEFT JOIN languages tl ON p.target_language_id = tl.id
      LEFT JOIN project_units pu ON pu.project_id = p.id
      LEFT JOIN chapter_assignments ca ON ca.project_unit_id = pu.id
      ${RECORDINGS_JOIN_CA}
      WHERE up.user_id = ?
      GROUP BY p.id
      ORDER BY p.name COLLATE NOCASE;`,
      [userId],
    );

    const rows = (result?.rows as unknown as DBTypes.ProjectSummaryRow[]) || [];
    log.info('Projects with summary fetched', { count: rows.length });
    return rows.map(mapProjectSummaryRow);
  } catch (error) {
    log.error('Error fetching projects with summary', {
      error: error instanceof Error ? error.message : String(error),
    });
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

function mapChapterActivityFields(row: {
  updated_at?: string | null;
  submitted_time?: string | null;
  last_recording_activity?: string | null;
}) {
  const lastActivityAt = pickLastActivityIso(
    row.updated_at,
    row.submitted_time,
    row.last_recording_activity,
  );

  return {
    lastActivityAt,
    lastActivityLabel: formatLastActivity(lastActivityAt),
  };
}

function mapChapterRowCore(
  row: Pick<
    DBTypes.ProjectChapterRow,
    | 'id'
    | 'book_name'
    | 'chapter_number'
    | 'updated_at'
    | 'submitted_time'
    | 'last_recording_activity'
    | 'recording_count'
    | 'pending_count'
    | 'total_verses'
    | 'completed_verses'
    | 'downloaded_verses'
  >,
) {
  const recordingCount = Number(row.recording_count) || 0;
  const pendingCount = Number(row.pending_count) || 0;
  const activity = mapChapterActivityFields(row);

  return {
    id: row.id,
    displayLabel: `${row.book_name} ${row.chapter_number}`,
    bookName: row.book_name,
    chapterNumber: row.chapter_number,
    syncState: deriveChapterSyncState(recordingCount, pendingCount),
    lastActivityAt: activity.lastActivityAt,
    lastActivityLabel: activity.lastActivityLabel,
    completedVerses: Number(row.completed_verses) || 0,
    totalVerses: Number(row.total_verses) || 0,
    downloadedVerses: Number(row.downloaded_verses) || 0,
  };
}

function mapMyWorkChapterRow(
  row: DBTypes.MyWorkChapterRow,
): DBTypes.MyWorkChapter {
  return {
    ...mapChapterRowCore(row),
    workflowStage: getBadgeStage(row.status),
    projectName: row.project_name,
    targetLanguageName: row.target_language_name,
  };
}

function mapProjectChapterRow(
  row: DBTypes.ProjectChapterRow,
): DBTypes.ProjectChapter {
  return {
    ...mapChapterRowCore(row),
    workflowStage: getWorkflowStage(row.status) ?? 'not_started',
  };
}

export async function getProjectChapters(
  projectId: number,
): Promise<DBTypes.ProjectChapter[]> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT
        ca.id,
        ca.book_id,
        ca.chapter_number,
        ca.status,
        ca.updated_at,
        ca.submitted_time,
        b.eng_display_name AS book_name,
        ${RECORDING_AGGREGATES},
        (
          SELECT COUNT(*)
          FROM bible_texts bt
          WHERE ${BIBLE_TEXTS_MATCH_CA}
        ) AS downloaded_verses,
        ca.total_verses,
        ca.completed_verses
      FROM chapter_assignments ca
      JOIN books b ON ca.book_id = b.id
      JOIN project_units pu ON ca.project_unit_id = pu.id
      ${RECORDINGS_JOIN_CA}
      WHERE pu.project_id = ?
      GROUP BY ca.id
      ORDER BY b.id, ca.chapter_number`,
      [Number(projectId)],
    );

    const rows = (result?.rows as unknown as DBTypes.ProjectChapterRow[]) || [];
    const chapters = rows.map(mapProjectChapterRow);

    log.info('Project chapters fetched', {
      projectId,
      count: chapters.length,
    });
    return chapters;
  } catch (error) {
    log.error('Error fetching project chapters', { error, projectId });
    throw error;
  }
}

export async function getMyWorkChapters(
  userId: number,
): Promise<DBTypes.MyWorkChapter[]> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT
        ca.id,
        ca.book_id,
        ca.chapter_number,
        ca.status,
        ca.updated_at,
        ca.submitted_time,
        b.eng_display_name AS book_name,
        p.name AS project_name,
        tl.lang_name AS target_language_name,
        ${RECORDING_AGGREGATES},
        (
          SELECT COUNT(*)
          FROM bible_texts bt
          WHERE ${BIBLE_TEXTS_MATCH_CA}
        ) AS downloaded_verses,
        ca.total_verses,
        ca.completed_verses
      FROM chapter_assignments ca
      JOIN books b ON ca.book_id = b.id
      JOIN project_units pu ON ca.project_unit_id = pu.id
      JOIN projects p ON pu.project_id = p.id
      LEFT JOIN languages tl ON p.target_language_id = tl.id
      ${RECORDINGS_JOIN_CA}
      WHERE ${MY_WORK_CHAPTER_WHERE}
      GROUP BY ca.id
      ORDER BY b.id, ca.chapter_number`,
      getMyWorkChapterQueryParams(userId),
    );

    const rows = (result?.rows as unknown as DBTypes.MyWorkChapterRow[]) || [];
    const chapters = rows.map(mapMyWorkChapterRow);

    log.info('My work chapters fetched', { count: chapters.length });
    return chapters;
  } catch (error) {
    log.error('Error fetching my work chapters', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** Latest recordings not yet uploaded to the Fluent server. */
export async function getPendingUploadCount(): Promise<number> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT COUNT(*) AS count
       FROM recordings
       WHERE is_latest = 1 AND sync_status != 'uploaded';`,
    );
    return Number(result.rows?.[0]?.count) || 0;
  } catch (error) {
    log.error('Error fetching pending upload count', { error });
    return 0;
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
