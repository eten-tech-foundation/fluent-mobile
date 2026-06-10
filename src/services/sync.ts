import { FluentAPI } from './api';
import {
  mapApiChapterAssignment,
  ApiUserChapterAssignment,
} from './mapChapterAssignment';
import {
  insertUser,
  insertMasterData,
  insertProjects,
  insertChapterAssignmentSyncData,
  insertBibleTexts,
  getChaptersToSync,
  insertUserProjects,
} from '../db/repository';
import { logger } from '../utils/logger';
import { getDatabase } from '../db/db';
import { ApiBook, ApiVerse } from '../types/api/types';
import {
  setUserSync,
  setSyncCount,
  setLastSyncedAt,
  getLastSyncedAt,
  getUserIdSync,
  getUserEmailSync,
  KV_KEYS,
  setSyncError,
  clearSyncError,
  clearAllSyncErrors,
  getLastAssignmentSyncAt,
  setLastAssignmentSyncAt,
  getKnownUserIds,
  getActiveUserId,
} from '../services/storage';
import { getLocalProjectIds } from '../db/repository';
import {
  clearTempCredentials,
  getCredentials,
  getTempCredentials,
  saveCredentials,
} from './keychain';
import { emitSyncComplete, emitSyncStart } from './syncEvents';
import { setActiveToken } from './api';

const log = logger.create('SyncService');

const MAX_SYNC_ATTEMPTS = 3;
const BIBLE_TEXT_CHUNK_SIZE = 1200;

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

export async function syncUser(email?: string) {
  return retrySyncStep('User sync', KV_KEYS.SYNC_ERROR_USER, async () => {
    const userEmail = email ?? getUserEmailSync();
    if (!userEmail) throw new Error('No email found');

    const user = await FluentAPI.getUserByEmail(userEmail);
    if (!user?.id) throw new Error('Invalid user response');

    await insertUser(user);
    setUserSync(String(user.id), userEmail);

    const tempCreds = await getTempCredentials();
    if (tempCreds?.token) {
      await saveCredentials(tempCreds.token, String(user.id));
      await clearTempCredentials();
      log.info('Token migrated from temp to userId', { userId: user.id });
    }

    log.info('User synced', { email: userEmail });
    return user;
  });
}

export async function syncMasterData() {
  return retrySyncStep(
    'Master data sync',
    KV_KEYS.SYNC_ERROR_MASTER_DATA,
    async () => {
      log.info('Syncing master data...');

      const languages = await FluentAPI.getLanguages();
      const books = await FluentAPI.getBooks();
      const bibles = await FluentAPI.getBibles();

      log.info('Master data fetched', {
        languagesCount: languages?.length,
        booksCount: books?.length,
        biblesCount: bibles?.length,
      });

      await insertMasterData(languages, books, bibles);
      log.info('Master data sync completed');
    },
  );
}

export async function syncProjects(userId: number) {
  return retrySyncStep(
    'Project sync',
    KV_KEYS.SYNC_ERROR_PROJECTS,
    async () => {
      log.info('Syncing projects...', { userId });

      const response = await FluentAPI.getUserProjects(userId);
      const projects = response.data ?? response;

      log.info('Projects fetched', {
        count: projects?.length,
        isArray: Array.isArray(projects),
      });

      if (projects.length > 0) {
        await insertProjects(projects);
        await insertUserProjects(
          userId,
          projects.map((p: { id: number }) => p.id),
        );
      }

      const db = getDatabase();
      const result = await db.execute(
        'SELECT COUNT(*) as count FROM user_projects WHERE user_id = ?',
        [userId],
      );
      const totalProjectsCount = result.rows?.[0]?.count || 0;
      setSyncCount(KV_KEYS.SYNC_COUNT_PROJECTS, Number(totalProjectsCount));

      log.info('Projects synced', {
        fetched: projects.length,
        userProjectsInDb: totalProjectsCount,
      });
    },
  );
}

export async function syncChapterAssignments(
  userId: number,
  updatedAfter?: string,
  excludeProjectIds?: number[],
) {
  return retrySyncStep(
    'Chapter assignment sync',
    KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS,
    async () => {
      log.info('Syncing chapter assignments...', {
        userId,
        updatedAfter,
        excludeProjectIds,
      });

      const response = await FluentAPI.getChapterAssignments(
        userId,
        updatedAfter,
        excludeProjectIds,
      );

      const raw = response.data ?? response;
      const allAssignments = (Array.isArray(raw) ? raw : []).map(
        (assignment: ApiUserChapterAssignment) =>
          mapApiChapterAssignment(assignment),
      );

      if (allAssignments.length > 0) {
        await insertChapterAssignmentSyncData(allAssignments);
        const db = getDatabase();
        const result = await db.execute(
          'SELECT COUNT(*) as count FROM chapter_assignments',
        );
        setSyncCount(
          KV_KEYS.SYNC_COUNT_CHAPTERS,
          Number(result.rows?.[0]?.count ?? 0),
        );
        log.info('Chapter assignments synced', {
          fetched: allAssignments.length,
        });
      } else {
        log.info('No chapter assignment changes');
      }
    },
  );
}

export async function syncBibleTexts(updatedAfter?: string) {
  return retrySyncStep(
    'Bible text sync',
    KV_KEYS.SYNC_ERROR_BIBLE_TEXTS,
    async () => {
      log.info('Syncing bible texts...');

      const bibleGroups = await getChaptersToSync();

      if (bibleGroups.size === 0) {
        log.info('No chapters to sync');
        setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, 0);
        return;
      }

      log.info('Chapters to sync grouped by bible', {
        bibleCount: bibleGroups.size,
      });

      let totalTextsInserted = 0;

      for (const [bibleId, chapters] of bibleGroups) {
        log.info('Syncing chapters for bible', {
          bibleId,
          chapterCount: chapters.length,
        });

        for (let i = 0; i < chapters.length; i += BIBLE_TEXT_CHUNK_SIZE) {
          const chunk = chapters.slice(i, i + BIBLE_TEXT_CHUNK_SIZE);
          const chunkIndex = Math.floor(i / BIBLE_TEXT_CHUNK_SIZE);

          log.info('Fetching chunk', {
            bibleId,
            chunkIndex,
            chunkSize: chunk.length,
          });

          const response = await FluentAPI.getBibleTexts(
            bibleId,
            chunk,
            updatedAfter,
          );

          const books: ApiBook[] = response.data;

          if (!Array.isArray(books)) {
            throw new Error(`Invalid bible text response for bible ${bibleId}`);
          }

          const textsWithBibleId = books.map((book: ApiBook) => ({
            bibleId,
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

          const chunkVerseCount = textsWithBibleId.reduce(
            (count, book) => count + book.verses.length,
            0,
          );
          totalTextsInserted += chunkVerseCount;

          log.info('Chunk synced', {
            bibleId,
            chunkIndex,
            versesInserted: chunkVerseCount,
          });
        }
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

export async function syncAllUsers(): Promise<void> {
  log.info('Syncing all users...');
  clearAllSyncErrors();
  emitSyncStart();

  const knownUserIds = getKnownUserIds();
  const currentActiveUserId = getActiveUserId();
  const lastSyncedAt = getLastSyncedAt() || undefined;

  try {
    await syncMasterData();

    for (const userId of knownUserIds) {
      const creds = await getCredentials(userId);
      if (!creds?.token) {
        log.warn('No credentials for user, skipping', { userId });
        continue;
      }

      log.info('Syncing user', { userId });
      setActiveToken(creds.token);
      const userIdNum = Number(userId);

      try {
        const localProjectIds = await getLocalProjectIds();
        await syncProjects(userIdNum);

        if (localProjectIds.length === 0) {
          await syncChapterAssignments(userIdNum);
        } else {
          await syncChapterAssignments(userIdNum, lastSyncedAt);
        }
      } catch (error) {
        log.error('Sync failed for user', {
          userId,
          error: getErrorMessage(error),
        });
      }
    }

    await syncBibleTexts(lastSyncedAt);

    const activeCreds = await getCredentials(currentActiveUserId);
    setActiveToken(activeCreds?.token ?? null);

    const now = new Date().toISOString();
    setLastSyncedAt(now);
    setLastAssignmentSyncAt(now);

    emitSyncComplete();
    log.info('All users synced successfully!');
  } catch (error) {
    const activeCreds = await getCredentials(currentActiveUserId);
    setActiveToken(activeCreds?.token ?? null);
    log.error('Sync all users failed', { error: getErrorMessage(error) });
    throw error;
  }
}

export async function syncAllData(isIncremental = false, email?: string) {
  log.info('Starting sync...', { isIncremental });
  clearAllSyncErrors();
  emitSyncStart();

  try {
    let userId: number;
    if (isIncremental) {
      const existingUserIdStr = getUserIdSync();
      if (!existingUserIdStr) throw new Error('No user ID found');
      userId = Number(existingUserIdStr);

      const creds = await getCredentials(existingUserIdStr);
      setActiveToken(creds?.token ?? null);
    } else {
      const user = await syncUser(email);
      userId = user.id;
    }

    const localProjectIdsBefore = isIncremental
      ? []
      : await getLocalProjectIds();

    const lastSyncedAt = getLastSyncedAt() || undefined; // global
    const lastAssignmentSyncAt = getLastAssignmentSyncAt() || undefined;

    await syncMasterData();
    await syncProjects(userId);

    if (isIncremental) {
      await syncChapterAssignments(userId, lastSyncedAt);
      await syncBibleTexts(lastSyncedAt);
    } else if (localProjectIdsBefore.length === 0) {
      await syncChapterAssignments(userId);
      await syncBibleTexts();
    } else {
      await syncChapterAssignments(userId, lastAssignmentSyncAt);
      await syncBibleTexts(lastAssignmentSyncAt);
    }

    const now = new Date().toISOString();
    setLastSyncedAt(now);
    setLastAssignmentSyncAt(now);

    const db = getDatabase();
    const langCount = await db.execute(
      'SELECT COUNT(*) as count FROM languages',
    );
    const bookCount = await db.execute('SELECT COUNT(*) as count FROM books');
    const bibleCount = await db.execute('SELECT COUNT(*) as count FROM bibles');
    const projectCount = await db.execute(
      'SELECT COUNT(*) as count FROM projects',
    );
    const unitCount = await db.execute(
      'SELECT COUNT(*) as count FROM project_units',
    );
    const assignmentCount = await db.execute(
      'SELECT COUNT(*) as count FROM chapter_assignments',
    );
    const textCount = await db.execute(
      'SELECT COUNT(*) as count FROM bible_texts',
    );
    const userProjectCount = await db.execute(
      'SELECT COUNT(*) as count FROM user_projects',
    );

    log.info('DB row counts after sync', {
      languages: langCount.rows[0]?.count,
      books: bookCount.rows[0]?.count,
      bibles: bibleCount.rows[0]?.count,
      projects: projectCount.rows[0]?.count,
      projectUnits: unitCount.rows[0]?.count,
      chapterAssignments: assignmentCount.rows[0]?.count,
      bibleTexts: textCount.rows[0]?.count,
      userProjects: userProjectCount.rows[0]?.count,
    });

    emitSyncComplete();
    log.info('Sync completed successfully!', { timestamp: now });
  } catch (error) {
    log.error('Sync failed', { error: getErrorMessage(error) });
    throw error;
  }
}

export async function switchUser(userId: string): Promise<void> {
  log.info('Switching to user', { userId });
  emitSyncComplete();
}
