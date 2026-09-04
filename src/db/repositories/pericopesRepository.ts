import { getDatabase } from '../db';
import { logger } from '../../utils/logger';
import * as DBTypes from '../../types/db/types';
import { Transaction } from '@op-engineering/op-sqlite';
import { setPericopeSetVersion } from '../../services/storage';
import type { BundledPericopeVerse } from '../../types/pericopeSets/types';


const log = logger.create('PericopesRepository');

export async function insertPericopeSets(sets: DBTypes.PericopeSet[]) {
  if (!sets.length) return;
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    for (const set of sets) {
      await tx.execute(
        `INSERT INTO pericope_sets (id, name, description)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description`,
        [set.id, set.name, set.description ?? null],
      );
    }
  });
  log.info('Pericope sets synced', { count: sets.length });
}

export type ApiPericopeGroupInput = {
  pericopeNumber: string;
  pericopeTitle: string | null;
  verses: { chapterNumber: number; verseNumber: number }[];
};

export async function insertPericopeVersesBatch(
  chapters: Array<{
    bookId: number;
    chapterNumber: number;
    pericopeSetId: number | null;
    groups: ApiPericopeGroupInput[];
  }>,
) {
  if (!chapters.length) return;
  const db = getDatabase();
  let verseCount = 0;

  await db.transaction(async (tx: Transaction) => {
    for (const chapter of chapters) {
      for (const group of chapter.groups) {
        for (const verse of group.verses) {
          await tx.execute(
            `INSERT INTO pericope_verses
             (pericope_set_id, book_id, chapter_number, verse_number, pericope_number, pericope_title)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(pericope_set_id, book_id, chapter_number, verse_number) DO UPDATE SET
               pericope_number = excluded.pericope_number,
               pericope_title = excluded.pericope_title`,
            [
              chapter.pericopeSetId,
              chapter.bookId,
              verse.chapterNumber,
              verse.verseNumber,
              group.pericopeNumber,
              group.pericopeTitle,
            ],
          );
          verseCount++;
        }
      }
    }
  });

  log.info('Pericope verses batch synced', {
    chapterCount: chapters.length,
    verseCount,
  });
}

/** Distinct (project, book, chapter) triples the user has locally, for pericope sync. */
export async function getChaptersNeedingPericopeSync(): Promise<
  {
    projectId: number;
    bookId: number;
    bookCode: string;
    chapterNumber: number;
  }[]
> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT DISTINCT pu.project_id AS project_id, ca.book_id AS book_id,
            b.code AS book_code, ca.chapter_number AS chapter_number
     FROM chapter_assignments ca
     INNER JOIN project_units pu ON pu.id = ca.project_unit_id
     INNER JOIN books b ON b.id = ca.book_id`,
  );
  return (result.rows ?? []).map(row => ({
    projectId: Number(row.project_id),
    bookId: Number(row.book_id),
    bookCode: String(row.book_code),
    chapterNumber: Number(row.chapter_number),
  }));
}

/** Resolves a project's configured pericope set, or null if unset/unknown. */
export async function getProjectPericopeSetId(
  projectId: number,
): Promise<number | null> {
  const db = getDatabase();
  const result = await db.execute(
    'SELECT pericope_set_id FROM projects WHERE id = ?',
    [projectId],
  );
  const row = result.rows?.[0] as
    | { pericope_set_id?: number | null }
    | undefined;
  return row?.pericope_set_id ?? null;
}

async function getBookIdByCode(bookCode: string): Promise<number | null> {
  const db = getDatabase();
  const result = await db.execute('SELECT id FROM books WHERE code = ?', [
    bookCode,
  ]);
  const row = result.rows?.[0] as { id?: number } | undefined;
  return row?.id ?? null;
}

/**
 * Upserts one book's worth of bundled or API-fetched pericope verses for
 * a given set (#447 write path). Verses are already normalized to the
 * common shape by the caller (bundled loader, or later fluent-api#309's
 * response) -- this function only handles the SQLite write.
 *
 * `version` is stored in KV storage (services/storage.ts), not a
 * pericope_sets column -- avoids a schema migration + the
 * multiple-in-flight-branch version-collision risk. #438's sync step
 * reads it back via getPericopeSetVersion() to decide whether a reseed
 * is needed on the next run.
 */
export async function upsertPericopeSet(
  pericopeSetId: number,
  bookCode: string,
  verses: BundledPericopeVerse[],
  version: string,
): Promise<void> {
  if (!verses.length) return;

  const bookId = await getBookIdByCode(bookCode);
  if (bookId === null) {
    log.warn('Cannot upsert pericope set — book not synced locally yet', {
      pericopeSetId,
      bookCode,
    });
    return;
  }

  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    for (const verse of verses) {
      await tx.execute(
        `INSERT INTO pericope_verses
         (pericope_set_id, book_id, chapter_number, verse_number, pericope_number, pericope_title)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(pericope_set_id, book_id, chapter_number, verse_number) DO UPDATE SET
           pericope_number = excluded.pericope_number,
           pericope_title = excluded.pericope_title`,
        [
          pericopeSetId,
          bookId,
          verse.chapterNumber,
          verse.verseNumber,
          verse.pericopeNumber,
          verse.pericopeTitle,
        ],
      );
    }
  });

  setPericopeSetVersion(pericopeSetId, version);

  log.info('Pericope set upserted', {
    pericopeSetId,
    bookCode,
    bookId,
    verseCount: verses.length,
  });
}