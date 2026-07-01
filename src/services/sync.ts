import { FluentAPI } from './api';
import { isAuthError, AuthError } from './authError';
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
  ensureUserProjectMembership,
  userHasLocalProjects,
  userHasLocalChapterAssignments,
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
  setLastAssignmentSyncAt,
  getActiveUserId,
  getKnownUserIds,
  getUserLastSyncedAt,
  setUserLastSyncedAt,
} from '../services/storage';
import { getLocalProjectIds } from '../db/repository';
import {
  clearTempCredentials,
  getCredentials,
  getTempCredentials,
  saveCredentials,
  clearCredentials,
} from './keychain';
import {
  emitSyncComplete,
  emitSyncStart,
  emitAuthSessionExpired,
} from './syncEvents';
import { authToken } from './authToken';

const log = logger.create('SyncService');

const MAX_SYNC_ATTEMPTS = 3;
const BIBLE_TEXT_CHUNK_SIZE = 1200;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleSyncAuthFailure(userId: string): Promise<void> {
  await clearCredentials(userId);
  if (userId === getActiveUserId()) {
    authToken.set(null);
    emitAuthSessionExpired();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retrySyncStep<T>(
  stepName: string,
  errorKey: (typeof KV_KEYS)[keyof typeof KV_KEYS],
  operation: () => Promise<T>,
  failingUserId?: string,
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

      if (isAuthError(error)) {
        log.error(`${stepName} failed: session invalid`, {
          error: errorMessage,
        });
        setSyncError(errorKey, errorMessage);
        const userId = failingUserId ?? getActiveUserId();
        if (userId) {
          await handleSyncAuthFailure(userId);
        }
        throw error;
      }

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
  return retrySyncStep(
    'User sync',
    KV_KEYS.SYNC_ERROR_USER,
    async () => {
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
    },
    getUserIdSync() ?? getActiveUserId() ?? undefined,
  );
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
      const raw = response?.data ?? response;
      const projects = Array.isArray(raw) ? raw : [];

      log.info('Projects fetched', {
        count: projects.length,
        isArray: Array.isArray(raw),
      });

      if (projects.length > 0) {
        await insertProjects(projects);
        await insertUserProjects(
          userId,
          projects.map((p: { id: number }) => p.id),
        );
      }

      await ensureUserProjectMembership(userId);

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
    String(userId),
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
        await insertUserProjects(userId, [
          ...new Set(
            allAssignments
              .map((assignment: { projectId: number }) => assignment.projectId)
              .filter(id => Number.isFinite(id) && id > 0),
          ),
        ]);
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
    String(userId),
  );
}

async function syncChapterAssignmentsForUser(
  userId: number,
  updatedAfter?: string,
): Promise<{ didFullSync: boolean }> {
  const userIdStr = String(userId);

  if (!getUserLastSyncedAt(userIdStr)) {
    log.info(
      'Forcing full chapter assignment sync — user has no per-user sync cursor',
      { userId },
    );
    await syncChapterAssignments(userId);
    return { didFullSync: true };
  }

  if (updatedAfter && !(await userHasLocalChapterAssignments(userId))) {
    log.info(
      'Forcing full chapter assignment sync — local assignments empty despite sync cursor',
      { userId, staleUpdatedAfter: updatedAfter },
    );
    await syncChapterAssignments(userId);
    return { didFullSync: true };
  }

  await syncChapterAssignments(userId, updatedAfter);
  return { didFullSync: !updatedAfter };
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

  const currentActiveUserId = getActiveUserId();

  try {
    const knownUserIds = getKnownUserIds();
    const userIdsToSync =
      knownUserIds.length > 0
        ? knownUserIds
        : currentActiveUserId
        ? [currentActiveUserId]
        : [];

    if (userIdsToSync.length === 0) {
      throw new Error('No users to sync');
    }

    const activeCreds = currentActiveUserId
      ? await getCredentials(currentActiveUserId)
      : null;
    if (currentActiveUserId && !activeCreds?.token) {
      await handleSyncAuthFailure(currentActiveUserId);
      throw new AuthError('No session token. Please sign in again.');
    }

    const deviceHasLocalProjects = (await getLocalProjectIds()).length > 0;
    const deviceLastSyncedAt = getLastSyncedAt() || undefined;
    let activeUserSyncOk = true;
    let activeUserAuthFailed = false;
    let anyUserDidFullAssignmentSync = false;
    let firstNonAuthSyncError: unknown;
    let oldestAssignmentCursor: string | undefined;
    const usersPendingCursorUpdate: string[] = [];

    await syncMasterData();

    for (const userId of userIdsToSync) {
      const creds = await getCredentials(userId);
      if (!creds?.token) {
        log.warn('No credentials for user, skipping', { userId });
        if (userId === currentActiveUserId) {
          activeUserSyncOk = false;
          activeUserAuthFailed = true;
          await handleSyncAuthFailure(userId);
        }
        continue;
      }

      log.info('Syncing user', { userId });
      authToken.set(creds.token);
      const userIdNum = Number(userId);
      const userLastSyncedAt = getUserLastSyncedAt(userId) || undefined;
      const hasUserProjects = await userHasLocalProjects(userIdNum);
      const assignmentCursor = hasUserProjects ? userLastSyncedAt : undefined;

      try {
        await syncProjects(userIdNum);
        const { didFullSync } = await syncChapterAssignmentsForUser(
          userIdNum,
          assignmentCursor,
        );
        if (didFullSync) {
          anyUserDidFullAssignmentSync = true;
        }
        usersPendingCursorUpdate.push(userId);
        if (assignmentCursor) {
          oldestAssignmentCursor =
            oldestAssignmentCursor === undefined ||
            assignmentCursor < oldestAssignmentCursor
              ? assignmentCursor
              : oldestAssignmentCursor;
        }
      } catch (error) {
        if (isAuthError(error)) {
          if (userId === currentActiveUserId) {
            activeUserSyncOk = false;
            activeUserAuthFailed = true;
          } else {
            log.warn('Expired session credentials for user', { userId });
          }
        } else if (userId === currentActiveUserId) {
          activeUserSyncOk = false;
          if (firstNonAuthSyncError === undefined) {
            firstNonAuthSyncError = error;
          }
        }
        log.error('Sync failed for user', {
          userId,
          error: getErrorMessage(error),
        });
      }
    }

    const bibleTextUpdatedAfter = anyUserDidFullAssignmentSync
      ? undefined
      : oldestAssignmentCursor ??
        (deviceHasLocalProjects ? deviceLastSyncedAt : undefined);

    await syncBibleTexts(bibleTextUpdatedAfter);

    const userSyncCompletedAt = new Date().toISOString();
    for (const userId of usersPendingCursorUpdate) {
      setUserLastSyncedAt(userId, userSyncCompletedAt);
    }

    const restoredCreds = currentActiveUserId
      ? await getCredentials(currentActiveUserId)
      : null;
    authToken.set(restoredCreds?.token ?? null);

    if (activeUserSyncOk) {
      const now = new Date().toISOString();
      setLastSyncedAt(now);
      setLastAssignmentSyncAt(now);
      log.info('All users synced successfully!');
      return;
    }

    log.warn('Sync finished with errors for the active user');

    if (activeUserAuthFailed) {
      throw new AuthError('Session expired. Please sign in again.');
    }

    if (firstNonAuthSyncError !== undefined) {
      throw firstNonAuthSyncError;
    }
  } catch (error) {
    const restoredCreds = currentActiveUserId
      ? await getCredentials(currentActiveUserId)
      : null;
    authToken.set(restoredCreds?.token ?? null);
    log.error('Sync all users failed', { error: getErrorMessage(error) });
    throw error;
  } finally {
    emitSyncComplete();
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
      if (!creds?.token) {
        await handleSyncAuthFailure(existingUserIdStr);
        throw new AuthError('No session token. Please sign in again.');
      }
      authToken.set(creds.token);
    } else {
      const user = await syncUser(email);
      userId = user.id;
    }

    const localProjectIdsBefore = isIncremental
      ? []
      : await getLocalProjectIds();

    const lastSyncedAt = getLastSyncedAt() || undefined; // global
    const userIdStr = String(userId);
    const userAssignmentCursor = getUserLastSyncedAt(userIdStr) || undefined;

    await syncMasterData();
    await syncProjects(userId);

    if (isIncremental) {
      const assignmentCursor = userAssignmentCursor ?? lastSyncedAt;
      const { didFullSync } = await syncChapterAssignmentsForUser(
        userId,
        assignmentCursor,
      );
      await syncBibleTexts(didFullSync ? undefined : assignmentCursor);
    } else if (localProjectIdsBefore.length === 0) {
      await syncChapterAssignments(userId);
      await syncBibleTexts();
    } else {
      // Omit excludeProjectIds on re-login: the API can return [] when every
      // local project is excluded before checking newly assigned work.
      const { didFullSync } = await syncChapterAssignmentsForUser(
        userId,
        userAssignmentCursor,
      );
      await syncBibleTexts(didFullSync ? undefined : userAssignmentCursor);
    }

    const now = new Date().toISOString();
    setLastSyncedAt(now);
    setLastAssignmentSyncAt(now);
    setUserLastSyncedAt(userIdStr, now);

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

    log.info('Sync completed successfully!', { timestamp: now });
  } catch (error) {
    log.error('Sync failed', { error: getErrorMessage(error) });
    throw error;
  } finally {
    emitSyncComplete();
  }
}

export async function switchUser(userId: string): Promise<void> {
  log.info('Switching to user', { userId });
  emitSyncComplete();
}
