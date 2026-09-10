import { FluentAPI } from './api';
import { isAuthError, AuthError } from './authError';
import { mapApiChapterAssignment } from './mapChapterAssignment';
import { mapApiLanguage } from './mapApiLanguage';
import { mapApiProject } from './mapApiProject';
import {
  insertUser,
  insertMasterData,
  insertProjects,
  insertChapterAssignmentSyncData,
  insertBibleTexts,
  getChaptersToSync,
  getRecordingLinkedChaptersToSync,
  insertUserProjects,
  ensureUserProjectMembership,
  userHasLocalProjects,
  userHasLocalChapterAssignments,
  userNeedsAssigneeRepair,
  reconcileUserChapterWork,
  reconcileUserProjects,
  insertPericopeSets,
  getProjectPericopeSetId,
  getChaptersNeedingPericopeSync,
  upsertPericopeSet,
  getLocalProjectIds,
  hasLanguagesMissingIsoCode,
} from '../db/repository';
import { logger } from '../utils/logger';
import { getDatabase } from '../db/db';
import { ApiBook, ApiVerse } from '../types/api/types';
import { ApiUser, unwrapApiListResponse } from '../types/api/responses';
import { getConnectivitySnapshot } from './connectivity';
import {
  syncPendingChapterClaims,
  type SyncPendingChapterClaimsResult,
} from './chapterClaimSync';
import { getPericopeBookVersion, setPericopeBookVersion } from './storage';
import {
  loadBundledPericopeSet,
  getBundledPericopeSetVersion,
} from './pericopeSets';
import {
  setUserSync,
  registerKnownUser,
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
  setReauthRequired,
  isBibleTextsServerIdRemapPending,
  clearBibleTextsServerIdRemapPending,
} from '../services/storage';
import {
  clearTempCredentials,
  getCredentials,
  getTempCredentials,
  saveCredentials,
} from './keychain';
import {
  emitSyncComplete,
  emitSyncStart,
  emitAuthReauthRequired,
} from './syncEvents';

const log = logger.create('SyncService');

const MAX_SYNC_ATTEMPTS = 3;
const BIBLE_TEXT_CHUNK_SIZE = 1200;

type BibleChapterGroup = Map<
  number,
  Array<{ bookId: number; chapterNumber: number }>
>;

/** Merge chapter groups in place (dedupe by bible/book/chapter). */
function mergeBibleChapterGroups(
  target: BibleChapterGroup,
  source: BibleChapterGroup,
): void {
  for (const [bibleId, chapters] of source) {
    if (!target.has(bibleId)) {
      target.set(bibleId, []);
    }
    const list = target.get(bibleId)!;
    const seen = new Set(list.map(c => `${c.bookId}:${c.chapterNumber}`));
    for (const chapter of chapters) {
      const key = `${chapter.bookId}:${chapter.chapterNumber}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(chapter);
      }
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function handleSyncAuthFailure(userId: string): Promise<void> {
  setReauthRequired(userId);
  if (userId === getActiveUserId()) {
    emitAuthReauthRequired(userId);
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

export async function syncUser(email?: string, preloadedUser?: ApiUser) {
  return retrySyncStep(
    'User sync',
    KV_KEYS.SYNC_ERROR_USER,
    async () => {
      const userEmail = email ?? getUserEmailSync();
      if (!userEmail) throw new Error('No email found');

      const tempCreds = await getTempCredentials();
      if (!preloadedUser && tempCreds?.token) {
        log.info('User lookup using temp credentials token', { userEmail });
      }
      const user =
        preloadedUser ??
        (await FluentAPI.getUserByEmail(userEmail, tempCreds?.token));
      if (!user?.id) throw new Error('Invalid user response');

      await insertUser(user);
      const userIdStr = String(user.id);
      const activeUserId = getActiveUserId();
      const shouldSwitchActiveUser =
        activeUserId === '' || activeUserId === userIdStr;
      if (shouldSwitchActiveUser) {
        setUserSync(userIdStr, userEmail);
      } else {
        registerKnownUser(userIdStr, userEmail);
      }

      const existingCreds = await getCredentials(userIdStr);
      if (existingCreds?.token) {
        await clearTempCredentials();
        log.info('User credentials already persisted at login', {
          userId: user.id,
        });
      } else if (tempCreds?.token) {
        await saveCredentials(tempCreds.token, userIdStr);
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

      await insertMasterData(
        (languages ?? []).map(mapApiLanguage),
        books,
        bibles,
      );
      log.info('Master data sync completed');
    },
  );
}

export async function syncProjects(userId: number, sessionToken?: string) {
  return retrySyncStep(
    'Project sync',
    KV_KEYS.SYNC_ERROR_PROJECTS,
    async () => {
      log.info('Syncing projects...', { userId });

      const response = await FluentAPI.getUserProjects(userId, sessionToken);
      const raw = unwrapApiListResponse(response);
      const isConfirmedShape = Array.isArray(raw);
      const projects = (isConfirmedShape ? raw : []).map(mapApiProject);

      log.info('Projects fetched', {
        count: projects.length,
        isArray: isConfirmedShape,
      });

      if (projects.length > 0) {
        await insertProjects(projects);
        await insertUserProjects(
          userId,
          projects.map(project => project.id),
        );
      }

      if (isConfirmedShape) {
        await reconcileUserProjects(
          userId,
          projects.map(project => project.id),
        );
      } else {
        log.warn(
          'Skipping project reconciliation — unexpected response shape',
          { userId },
        );
      }

      if (!(isConfirmedShape && projects.length === 0)) {
        await ensureUserProjectMembership(userId);
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
    String(userId),
  );
}

export async function syncPendingChapterClaimsForUser(userId: number) {
  const { isOnline } = await getConnectivitySnapshot();
  if (!isOnline) {
    return { synced: 0, conflicts: 0, failed: 0 };
  }

  // Retry while any row failed (#470), then soft-fail: set SYNC_ERROR_CHAPTER_CLAIMS
  // and return without rethrowing so chapter assignment / bible-text sync still runs.
  // Auth failures still propagate.
  try {
    return await retrySyncStep(
      'Pending chapter claim sync',
      KV_KEYS.SYNC_ERROR_CHAPTER_CLAIMS,
      async () => {
        const result = await syncPendingChapterClaims(userId);
        if (result.failed > 0) {
          throw Object.assign(
            new Error(
              `Failed to sync ${result.failed} pending chapter claim(s)`,
            ),
            { claimResult: result },
          );
        }
        return result;
      },
      String(userId),
    );
  } catch (error) {
    if (isAuthError(error)) {
      throw error;
    }
    const claimResult = claimResultFromError(error);
    return (
      claimResult ?? {
        synced: 0,
        conflicts: 0,
        failed: 1,
      }
    );
  }
}

export async function syncChapterAssignments(
  userId: number,
  updatedAfter?: string,
  excludeProjectIds?: number[],
  sessionToken?: string,
): Promise<{ syncedAt?: string; partialSkipWarning?: string }> {
  let partialSkipWarning: string | undefined;
  const result = await retrySyncStep(
    'Chapter assignment sync',
    KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS,
    async () => {
      partialSkipWarning = undefined;
      log.info('Syncing chapter assignments...', {
        userId,
        updatedAfter,
        excludeProjectIds,
      });

      const response = await FluentAPI.getChapterAssignments(
        userId,
        updatedAfter,
        excludeProjectIds,
        sessionToken,
      );

      const syncedAt =
        response !== null &&
        typeof response === 'object' &&
        !Array.isArray(response)
          ? response.syncedAt
          : undefined;
      const raw = unwrapApiListResponse(response);
      const allAssignments = (Array.isArray(raw) ? raw : []).map(
        mapApiChapterAssignment,
      );

      if (allAssignments.length > 0) {
        const { insertedCount, skipped } =
          await insertChapterAssignmentSyncData(allAssignments);
        if (insertedCount === 0) {
          throw new Error(
            `Skipped all ${skipped.length} chapter assignment(s) — missing FK parents`,
          );
        }
        if (skipped.length > 0) {
          partialSkipWarning = `Skipped ${skipped.length} of ${allAssignments.length} chapter assignment(s) — missing FK parents`;
        }
        await insertUserProjects(userId, [
          ...new Set(
            allAssignments
              .map((assignment: { projectId: number }) => assignment.projectId)
              .filter(id => Number.isFinite(id) && id > 0),
          ),
        ]);
        const db = getDatabase();
        const countResult = await db.execute(
          'SELECT COUNT(*) as count FROM chapter_assignments',
        );
        setSyncCount(
          KV_KEYS.SYNC_COUNT_CHAPTERS,
          Number(countResult.rows?.[0]?.count ?? 0),
        );
        log.info('Chapter assignments synced', {
          fetched: allAssignments.length,
          inserted: insertedCount,
          skipped: skipped.length,
        });
      } else {
        log.info('No chapter assignment changes');
      }

      return { syncedAt };
    },
    String(userId),
  );
  return { ...result, partialSkipWarning };
}

async function syncUserChapterWork(
  userId: number,
  sessionToken?: string,
): Promise<{ partialSkipWarning?: string }> {
  let partialSkipWarning: string | undefined;
  await retrySyncStep(
    'User chapter work sync',
    KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS,
    async () => {
      partialSkipWarning = undefined;
      const response = await FluentAPI.getUserChapterAssignments(
        userId,
        sessionToken,
      );
      const isConfirmedShape =
        response !== null &&
        typeof response === 'object' &&
        Array.isArray(response.assignedChapters) &&
        Array.isArray(response.peerCheckChapters);

      const assigned = Array.isArray(response?.assignedChapters)
        ? response.assignedChapters
        : [];
      const peerCheck = Array.isArray(response?.peerCheckChapters)
        ? response.peerCheckChapters
        : [];
      const mapped = [...assigned, ...peerCheck].map(mapApiChapterAssignment);

      if (mapped.length > 0) {
        const { insertedCount, skipped } =
          await insertChapterAssignmentSyncData(mapped);
        if (insertedCount === 0) {
          throw new Error(
            `Skipped all ${skipped.length} chapter assignment(s) — missing FK parents`,
          );
        }
        if (skipped.length > 0) {
          partialSkipWarning = `Skipped ${skipped.length} of ${mapped.length} chapter assignment(s) — missing FK parents`;
        }
      }
      if (isConfirmedShape) {
        await reconcileUserChapterWork(
          userId,
          assigned.map(a => a.chapterAssignmentId),
          peerCheck.map(a => a.chapterAssignmentId),
        );
      } else {
        log.warn(
          'Skipping chapter work reconciliation — unexpected response shape',
          { userId },
        );
      }
    },
    String(userId),
  );
  return { partialSkipWarning };
}

function applyChapterAssignmentSkipWarning(
  ...warnings: Array<string | undefined>
): string | undefined {
  const combined = warnings.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (combined.length === 0) {
    return undefined;
  }
  const warning = combined.join('; ');
  setSyncError(KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS, warning);
  return warning;
}

function claimResultFromError(
  error: unknown,
): SyncPendingChapterClaimsResult | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'claimResult' in error &&
    typeof (error as { claimResult: unknown }).claimResult === 'object' &&
    (error as { claimResult: unknown }).claimResult !== null
  ) {
    return (error as { claimResult: SyncPendingChapterClaimsResult })
      .claimResult;
  }
  return undefined;
}

async function syncChapterAssignmentsForUser(
  userId: number,
  updatedAfter?: string,
  sessionToken?: string,
): Promise<{
  didFullSync: boolean;
  syncedAt?: string;
  partialSkipWarning?: string;
}> {
  const userIdStr = String(userId);

  const runFullProjectAssignments = async () => {
    const projectResult = await syncChapterAssignments(
      userId,
      undefined,
      undefined,
      sessionToken,
    );
    const workResult = await syncUserChapterWork(userId, sessionToken);
    const partialSkipWarning = applyChapterAssignmentSkipWarning(
      workResult.partialSkipWarning,
      projectResult.partialSkipWarning,
    );
    return {
      // Withhold cursor advancement when skips remain so the next sync
      // re-fetches instead of clearing the warning as a false recovery (#470).
      syncedAt: partialSkipWarning ? undefined : projectResult.syncedAt,
      partialSkipWarning,
    };
  };

  if (!getUserLastSyncedAt(userIdStr)) {
    log.info(
      'Forcing full chapter assignment sync — user has no per-user sync cursor',
      { userId },
    );
    const { syncedAt, partialSkipWarning } = await runFullProjectAssignments();
    return { didFullSync: true, syncedAt, partialSkipWarning };
  }

  if (
    (updatedAfter && !(await userHasLocalChapterAssignments(userId))) ||
    (await userNeedsAssigneeRepair(userId))
  ) {
    log.info(
      'Forcing full chapter assignment sync — local assignments incomplete',
      { userId },
    );
    const { syncedAt, partialSkipWarning } = await runFullProjectAssignments();
    return { didFullSync: true, syncedAt, partialSkipWarning };
  }

  const projectResult = await syncChapterAssignments(
    userId,
    updatedAfter,
    undefined,
    sessionToken,
  );
  const workResult = await syncUserChapterWork(userId, sessionToken);
  const partialSkipWarning = applyChapterAssignmentSkipWarning(
    workResult.partialSkipWarning,
    projectResult.partialSkipWarning,
  );
  return {
    didFullSync: !updatedAfter,
    syncedAt: partialSkipWarning ? undefined : projectResult.syncedAt,
    partialSkipWarning,
  };
}

export async function syncBibleTexts(updatedAfter?: string) {
  return retrySyncStep(
    'Bible text sync',
    KV_KEYS.SYNC_ERROR_BIBLE_TEXTS,
    async () => {
      log.info('Syncing bible texts...');

      // #469: one-shot full fetch after upgrade so local autoincrement ids remap.
      // Keep the KV flag until this step succeeds so a failed sync can retry.
      let cursorForSync = updatedAfter;
      const remapPending = isBibleTextsServerIdRemapPending();
      if (remapPending) {
        log.warn(
          'Bible texts server-id remap pending; full-fetching without cursor',
        );
        cursorForSync = undefined;
      }

      const bibleGroups = await getChaptersToSync();
      // #469: remap must cover recording-linked verses even when the chapter is
      // no longer in chapter_assignments. Clear the pending flag only after
      // those chapters are fetched and upserted below.
      if (remapPending) {
        mergeBibleChapterGroups(
          bibleGroups,
          await getRecordingLinkedChaptersToSync(),
        );
      }

      if (bibleGroups.size === 0) {
        log.info('No chapters to sync');
        setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, 0);
        return;
      }

      log.info('Chapters to sync grouped by bible', {
        bibleCount: bibleGroups.size,
      });

      let totalTextsInserted = 0;
      const db = getDatabase();

      for (const [bibleId, chapters] of bibleGroups) {
        log.info('Syncing chapters for bible', {
          bibleId,
          chapterCount: chapters.length,
        });

        for (let i = 0; i < chapters.length; i += BIBLE_TEXT_CHUNK_SIZE) {
          const chunk = chapters.slice(i, i + BIBLE_TEXT_CHUNK_SIZE);
          const chunkIndex = Math.floor(i / BIBLE_TEXT_CHUNK_SIZE);

          // Root cause (#177): incremental `updatedAfter` can return empty payloads
          // for newly assigned chapters whose verses were never inserted locally.
          // Force a full chapter fetch when any chapter in the chunk has 0 verses.
          let cursor = cursorForSync;
          if (cursorForSync) {
            for (const chapter of chunk) {
              const countResult = await db.execute(
                `SELECT COUNT(*) AS count FROM bible_texts
                 WHERE bible_id = ? AND book_id = ? AND chapter_number = ?`,
                [bibleId, chapter.bookId, chapter.chapterNumber],
              );
              const count = Number(
                (countResult.rows?.[0] as { count?: number } | undefined)
                  ?.count ?? 0,
              );
              if (count === 0) {
                log.warn(
                  'Chapter missing local bible_texts; full-fetching without cursor',
                  {
                    bibleId,
                    bookId: chapter.bookId,
                    chapterNumber: chapter.chapterNumber,
                  },
                );
                cursor = undefined;
                break;
              }
            }
          }

          log.info('Fetching chunk', {
            bibleId,
            chunkIndex,
            chunkSize: chunk.length,
            incremental: Boolean(cursor),
          });

          const response = await FluentAPI.getBibleTexts(
            bibleId,
            chunk,
            cursor,
          );

          const books: ApiBook[] = response.data;

          if (!Array.isArray(books)) {
            throw new Error(`Invalid bible text response for bible ${bibleId}`);
          }

          const textsWithBibleId = books.map((book: ApiBook) => ({
            bibleId,
            bookId: book.bookId,
            chapterNumber: book.chapterNumber,
            verses: book.verses.map((verse: ApiVerse) => {
              if (!Number.isFinite(verse.id) || verse.id <= 0) {
                throw new Error(
                  `Bible text sync missing verse id for bible ${bibleId} book ${book.bookId} ch ${book.chapterNumber} v ${verse.verseNumber}`,
                );
              }
              return {
                id: verse.id,
                bible_id: bibleId,
                book_id: book.bookId,
                chapter_number: book.chapterNumber,
                verse_number: verse.verseNumber,
                text: verse.text,
              };
            }),
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

      const result = await db.execute(
        'SELECT COUNT(DISTINCT bible_id) as count FROM bible_texts',
      );
      const uniqueBiblesCount = result.rows?.[0]?.count || 0;
      setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, Number(uniqueBiblesCount));

      log.info('Bible texts sync completed', {
        textsInserted: totalTextsInserted,
        uniqueBiblesInDb: uniqueBiblesCount,
      });

      if (remapPending) {
        clearBibleTextsServerIdRemapPending();
      }
    },
  );
}

export async function syncPericopeSets() {
  return retrySyncStep(
    'Pericope sets sync',
    KV_KEYS.SYNC_ERROR_PERICOPE_SETS,
    async () => {
      const sets = await FluentAPI.getPericopeSets();
      await insertPericopeSets(sets);
      log.info('Pericope sets synced', { count: sets.length });
    },
  );
}

/**
 * Set-level pericope hydrate (Refs #438).
 *
 * Per-chapter GETs were removed here: the amended #438 bandwidth contract
 * forbids one HTTP call per assigned chapter on mobile sync. The intended
 * replacement — bundled-asset seed (#447) with a set-level API fallback
 * (fluent-api#309) — has no implementation to call yet, since neither
 * ticket has landed. This step derives the distinct pericope_set_ids in
 * play and no-ops with a clear log per set until a hydrate source exists.
 *
 * Follow-up: #TBD — wire loadBundledPericopeSet() (#447) and
 * FluentAPI.getPericopeSet() (fluent-api#309) into this function.
 */
export async function syncPericopes() {
  return retrySyncStep(
    'Pericope sync',
    KV_KEYS.SYNC_ERROR_PERICOPES,
    async () => {
      const chapters = await getChaptersNeedingPericopeSync();
      if (chapters.length === 0) {
        log.info('No chapters need pericope sync');
        return;
      }

      const distinctProjectIds = [...new Set(chapters.map(c => c.projectId))];
      const pericopeSetIdByProject = new Map<number, number | null>();
      await Promise.all(
        distinctProjectIds.map(async id =>
          pericopeSetIdByProject.set(id, await getProjectPericopeSetId(id)),
        ),
      );

      // Group chapters by their project's pericope set, so we know which
      // (setId, bookCode) pairs actually need hydrating.
      const chaptersBySetId = new Map<number, typeof chapters>();
      for (const chapter of chapters) {
        const setId = pericopeSetIdByProject.get(chapter.projectId);
        if (setId === null || setId === undefined) continue;
        const existing = chaptersBySetId.get(setId) ?? [];
        existing.push(chapter);
        chaptersBySetId.set(setId, existing);
      }

      if (chaptersBySetId.size === 0) {
        log.info('No chapters with a pericope set assigned');
        return;
      }

      for (const [pericopeSetId, setChapters] of chaptersBySetId) {
        const bundledVersion = getBundledPericopeSetVersion(pericopeSetId);

        if (!bundledVersion) {
          log.info(
            'No bundled source for this set — blocked on network path (fluent-api#309)',
            { pericopeSetId },
          );
          continue;
        }

        const distinctBookCodes = [
          ...new Set(setChapters.map(c => c.bookCode)),
        ];

        for (const bookCode of distinctBookCodes) {
          const storedBookVersion = getPericopeBookVersion(
            pericopeSetId,
            bookCode,
          );
          if (storedBookVersion === bundledVersion) {
            log.info('Pericope book already current, skipping reseed', {
              pericopeSetId,
              bookCode,
            });
            continue;
          }

          const verses = loadBundledPericopeSet(pericopeSetId, bookCode);
          if (!verses) {
            log.warn(
              'No bundled data for book in this set — will retry next sync',
              { pericopeSetId, bookCode },
            );
            continue;
          }

          await upsertPericopeSet(pericopeSetId, bookCode, verses);
          setPericopeBookVersion(pericopeSetId, bookCode, bundledVersion);
        }
      }
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
    await syncPericopeSets();

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
      const userIdNum = Number(userId);
      const userLastSyncedAt = getUserLastSyncedAt(userId) || undefined;
      const hasUserProjects = await userHasLocalProjects(userIdNum);
      const assignmentCursor = hasUserProjects ? userLastSyncedAt : undefined;

      try {
        await syncProjects(userIdNum, creds.token);
        await syncPendingChapterClaimsForUser(userIdNum);
        const { didFullSync, partialSkipWarning } =
          await syncChapterAssignmentsForUser(
            userIdNum,
            assignmentCursor,
            creds.token,
          );
        if (didFullSync) {
          anyUserDidFullAssignmentSync = true;
        }
        if (!partialSkipWarning) {
          usersPendingCursorUpdate.push(userId);
        }
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

    await syncPericopes();
    await syncBibleTexts(bibleTextUpdatedAfter);

    const userSyncCompletedAt = new Date().toISOString();
    for (const userId of usersPendingCursorUpdate) {
      setUserLastSyncedAt(userId, userSyncCompletedAt);
    }

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
    log.error('Sync all users failed', { error: getErrorMessage(error) });
    throw error;
  } finally {
    emitSyncComplete();
  }
}

export async function syncAllData(
  isIncremental = false,
  email?: string,
  preloadedUser?: ApiUser,
) {
  log.info('Starting sync...', { isIncremental });
  clearAllSyncErrors();
  emitSyncStart();

  try {
    let userId: number;
    let sessionToken: string | undefined;
    if (isIncremental) {
      const existingUserIdStr = getUserIdSync();
      if (!existingUserIdStr) throw new Error('No user ID found');
      userId = Number(existingUserIdStr);

      const creds = await getCredentials(existingUserIdStr);
      if (!creds?.token) {
        await handleSyncAuthFailure(existingUserIdStr);
        throw new AuthError('No session token. Please sign in again.');
      }
      sessionToken = creds.token;
    } else {
      const user = await syncUser(email, preloadedUser);
      userId = user.id;
      const userIdStr = String(userId);
      const creds = await getCredentials(userIdStr);
      if (!creds?.token) {
        await handleSyncAuthFailure(userIdStr);
        throw new AuthError('No session token for synced user.');
      }
      sessionToken = creds.token;
    }

    const localProjectIdsBefore = isIncremental
      ? []
      : await getLocalProjectIds();

    const lastSyncedAt = getLastSyncedAt() || undefined; // global
    const userIdStr = String(userId);
    const userAssignmentCursor = getUserLastSyncedAt(userIdStr) || undefined;

    await syncMasterData();
    await syncPericopeSets();
    await syncProjects(userId, sessionToken);
    await syncPendingChapterClaimsForUser(userId);

    let assignmentPartialSkipWarning: string | undefined;

    if (isIncremental) {
      const assignmentCursor = userAssignmentCursor ?? lastSyncedAt;
      const { didFullSync, partialSkipWarning } =
        await syncChapterAssignmentsForUser(
          userId,
          assignmentCursor,
          sessionToken,
        );
      assignmentPartialSkipWarning = partialSkipWarning;
      await syncPericopes();
      await syncBibleTexts(didFullSync ? undefined : assignmentCursor);
    } else if (localProjectIdsBefore.length === 0) {
      const projectResult = await syncChapterAssignments(
        userId,
        undefined,
        undefined,
        sessionToken,
      );
      const workResult = await syncUserChapterWork(userId, sessionToken);
      assignmentPartialSkipWarning = applyChapterAssignmentSkipWarning(
        workResult.partialSkipWarning,
        projectResult.partialSkipWarning,
      );
      await syncPericopes();
      await syncBibleTexts();
    } else {
      // Omit excludeProjectIds on re-login: the API can return [] when every
      // local project is excluded before checking newly assigned work.
      const { didFullSync, partialSkipWarning } =
        await syncChapterAssignmentsForUser(
          userId,
          userAssignmentCursor,
          sessionToken,
        );
      assignmentPartialSkipWarning = partialSkipWarning;
      await syncPericopes();
      await syncBibleTexts(didFullSync ? undefined : userAssignmentCursor);
    }

    const now = new Date().toISOString();
    setLastSyncedAt(now);
    setLastAssignmentSyncAt(now);
    if (!assignmentPartialSkipWarning) {
      setUserLastSyncedAt(userIdStr, now);
    }

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

const inFlightMetadataRefresh = new Map<number, Promise<void>>();

/** Skip repeated full master-data pulls after a successful backfill this session. */
let masterDataBackfilledThisSession = false;

async function maybeBackfillMasterDataOnRefresh(): Promise<void> {
  if (masterDataBackfilledThisSession) return;
  const needsIso = await hasLanguagesMissingIsoCode();
  if (!needsIso) {
    masterDataBackfilledThisSession = true;
    return;
  }
  emitSyncStart();
  try {
    await syncMasterData();
  } finally {
    emitSyncComplete();
  }
  // Only latch the session flag once ISO codes are actually present so a
  // partial/empty master-data response can retry on later metadata refreshes.
  if (!(await hasLanguagesMissingIsoCode())) {
    masterDataBackfilledThisSession = true;
  }
}

export async function refreshChapterMetadataIfOnline(
  userId: number,
): Promise<void> {
  const existing = inFlightMetadataRefresh.get(userId);
  if (existing) {
    return existing;
  }

  const refreshPromise = (async () => {
    try {
      const { isOnline } = await getConnectivitySnapshot();
      if (!isOnline) return;

      const userIdStr = String(userId);

      if (userIdStr !== getActiveUserId()) {
        log.warn(
          'Skipping background metadata refresh — user is no longer active',
          {
            userId,
          },
        );
        return;
      }

      const creds = await getCredentials(userIdStr);
      if (!creds?.token) {
        await handleSyncAuthFailure(userIdStr);
        return;
      }

      const sessionToken = creds.token;
      // One-shot ISO backfill for devices that synced languages before
      // mapApiLanguage. Verse text stays on Sync Now / DraftingScreen ensure.
      await maybeBackfillMasterDataOnRefresh();
      await syncProjects(userId, sessionToken);

      const cursor = getUserLastSyncedAt(userIdStr) || undefined;
      const { syncedAt } = await syncChapterAssignmentsForUser(
        userId,
        cursor,
        sessionToken,
      );
      if (syncedAt) {
        setUserLastSyncedAt(userIdStr, syncedAt);
      }
    } catch (error) {
      if (isAuthError(error)) {
        await handleSyncAuthFailure(String(userId));
      }
      log.warn('Chapter metadata refresh failed (non-blocking)', {
        userId,
        error: getErrorMessage(error),
      });
    } finally {
      inFlightMetadataRefresh.delete(userId);
    }
  })();

  inFlightMetadataRefresh.set(userId, refreshPromise);
  return refreshPromise;
}
