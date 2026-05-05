import { FluentAPI } from './api';
import {
  insertUser,
  insertMasterData,
  insertProjects,
  insertChapterAssignmentSyncData,
  insertBibleTexts,
  getChaptersToSync,
} from '../db/repository';
import { logger } from '../utils/logger';
import { getDatabase } from '../db/db';
import { ApiBook, ApiVerse } from '../types/api/types';
import {
  setUserSync,
  setSyncCount,
  setLastSyncedAt,
  KV_KEYS,
  setSyncError,
  clearSyncError,
  clearAllSyncErrors,
} from '../services/storage';

const log = logger.create('SyncService');

const MAX_SYNC_ATTEMPTS = 3;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retrySyncStep<T>(
  stepName: string,
  errorKey: (typeof KV_KEYS)[keyof typeof KV_KEYS],
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
    try {
      const result = await operation();
      clearSyncError(errorKey);
      return result;
    } catch (error) {
      lastError = error;
      const errorMessage = getErrorMessage(error);

      if (attempt === MAX_SYNC_ATTEMPTS) {
        log.error(`${stepName} failed after ${MAX_SYNC_ATTEMPTS} attempts`, {
          error: errorMessage,
        });
        setSyncError(errorKey, errorMessage);
        break;
      }

      log.warn(`${stepName} failed, retrying`, {
        attempt,
        maxAttempts: MAX_SYNC_ATTEMPTS,
        error: errorMessage,
      });
      await delay(attempt * 500);
    }
  }

  throw lastError;
}

export async function syncUser(email: string) {
  return retrySyncStep('User sync', KV_KEYS.SYNC_ERROR_USER, async () => {
    log.info('Syncing user...');

    const user = await FluentAPI.getUserByEmail(email);

    if (!user?.id) {
      throw new Error('Invalid user response');
    }

    await insertUser(user);

    setUserSync(String(user.id), user.email);
    log.info('User synced', { email: user.email });

    return user;
  });
}

export async function syncMasterData() {
  return retrySyncStep(
    'Master data sync',
    KV_KEYS.SYNC_ERROR_MASTER_DATA,
    async () => {
      log.info('Sync started');

      const [languages, books, bibles] = await Promise.all([
        FluentAPI.getLanguages(),
        FluentAPI.getBooks(),
        FluentAPI.getBibles(),
      ]);

      await insertMasterData(languages, books, bibles);

      log.info('Sync completed');
    },
  );
}

export async function syncProjects(userId: number, email: string) {
  return retrySyncStep(
    'Project sync',
    KV_KEYS.SYNC_ERROR_PROJECTS,
    async () => {
      log.info('Syncing projects...');

      const projects = await FluentAPI.getUserProjects(userId, email);

      await insertProjects(projects);
      const db = getDatabase();
      const result = await db.execute('SELECT COUNT(*) as count FROM projects');
      const totalProjectsCount = result.rows?.[0]?.count || 0;
      setSyncCount(KV_KEYS.SYNC_COUNT_PROJECTS, Number(totalProjectsCount));

      log.info('Projects synced', { count: projects.length });
    },
  );
}

export async function syncChapterAssignments(userId: number, email: string) {
  return retrySyncStep(
    'Chapter assignment sync',
    KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS,
    async () => {
      log.info('Syncing chapter assignments...');

      const response = await FluentAPI.getChapterAssignments(userId, email);

      const allAssignments = [
        ...(response?.assignedChapters || []),
        ...(response?.peerCheckChapters || []),
      ];

      if (allAssignments.length > 0) {
        await insertChapterAssignmentSyncData(allAssignments);

        const db = getDatabase();
        const result = await db.execute(
          'SELECT COUNT(*) as count FROM chapter_assignments',
        );
        const totalChaptersCount = result.rows?.[0]?.count || 0;
        setSyncCount(KV_KEYS.SYNC_COUNT_CHAPTERS, Number(totalChaptersCount));

        log.info('Chapter assignments synced', {
          apiCount: allAssignments.length,
          totalInDb: totalChaptersCount,
        });
      }
    },
  );
}

export async function syncBibleTexts(email: string) {
  return retrySyncStep(
    'Bible text sync',
    KV_KEYS.SYNC_ERROR_BIBLE_TEXTS,
    async () => {
      log.info('Syncing bible texts...');

      const bibleGroups = await getChaptersToSync();

      if (bibleGroups.size === 0) {
        log.info('No chapters to sync');
        setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, 0);
        return 0;
      }

      let totalTextsInserted = 0;

      for (const [bibleId, chapters] of bibleGroups) {
        log.info('Syncing chapters for bible', {
          bibleId,
          chapterCount: chapters.length,
        });

        const response: ApiBook[] = await FluentAPI.getBibleTexts(
          bibleId,
          chapters,
          email,
        );

        if (!Array.isArray(response)) {
          throw new Error(`Invalid bible text response for bible ${bibleId}`);
        }

        const textsWithBibleId = response.map((book: ApiBook) => ({
          bookId: book.bookId,
          chapterNumber: book.chapterNumber,
          verses: book.verses.map((verse: ApiVerse) => ({
            bible_id: bibleId,
            book_id: book.bookId,
            chapter_number: book.chapterNumber,
            verse_number: verse.verseNumber,
            text: verse.text,
          })),
        }));

        await insertBibleTexts(textsWithBibleId);
        totalTextsInserted += textsWithBibleId.reduce(
          (count, book) => count + book.verses.length,
          0,
        );
        log.info('Synced books for bible', {
          bibleId,
          count: response.length,
        });
      }
      const db = getDatabase();
      const result = await db.execute(
        'SELECT COUNT(DISTINCT bible_id) as count FROM bible_texts',
      );
      const uniqueBiblesCount = result.rows?.[0]?.count || 0;
      setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, Number(uniqueBiblesCount));

      log.info('Bible texts sync completed', {
        textsInserted: totalTextsInserted,
        uniqueBiblesInDb: uniqueBiblesCount,
      });
    },
  );
}

export async function syncAllData(email: string) {
  log.info('Starting full sync...');
  clearAllSyncErrors();

  try {
    const user = await syncUser(email);

    await syncMasterData();

    await syncProjects(user.id, email);

    await syncChapterAssignments(user.id, email);

    await syncBibleTexts(email);

    const now = new Date().toISOString();
    setLastSyncedAt(now);

    log.info('Full sync completed successfully!', { timestamp: now });
  } catch (error) {
    log.error('Full sync failed', { error: getErrorMessage(error) });
    throw error;
  }
}
