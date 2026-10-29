import { FluentAPI } from './api';
import { getChapterAssignmentPullRevision } from '../utils/chapterCompletionSyncGuard';
import { isTransientTransportFailure } from '../types/api/errors';
import { isAuthError, AuthError } from './authError';
import { mapApiChapterAssignment } from './mapChapterAssignment';
import { mapApiLanguage } from './mapApiLanguage';
import { mapApiProject } from './mapApiProject';
import { mapApiMilestone } from './mapApiMilestone';
import {
  insertUser,
  insertMasterData,
  insertProjects,
  insertChapterAssignmentSyncData,
  insertBibleTexts,
  getChaptersToSync,
  getMyWorkChaptersToSync,
  getRecordingLinkedChaptersToSync,
  insertUserProjects,
  ensureUserProjectMembership,
  userHasLocalProjects,
  userHasLocalChapterAssignments,
  userNeedsAssigneeRepair,
  reconcileUserChapterWork,
  reconcileUserMilestones,
  reconcileUserProjects,
  insertPericopeSets,
  getProjectPericopeSetId,
  getChaptersNeedingPericopeSync,
  upsertPericopeSet,
  getLocalProjectIds,
  hasLanguagesMissingIsoCode,
  selectExistingIds,
  upsertProjectUnits,
} from '../db/repository';
import { logger } from '../utils/logger';
import { getDatabase } from '../db/db';
import { ApiBook, ApiVerse } from '../types/api/types';
import { ApiError, isApiError, isRetryableApiError } from '../types/api/errors';
import { ApiUser, unwrapApiListResponse } from '../types/api/responses';
import type { ChapterAssignment, Project } from '../types/db/types';
import { getConnectivitySnapshot } from './connectivity';
import {
  reconcilePendingClaimsAfterAssignmentPull,
  syncPendingChapterClaims,
  type SyncPendingChapterClaimsResult,
} from './chapterClaimSync';
import { syncPendingStageAdvances } from './stageAdvanceSync';
import {
  persistOrgGrantsFromUserResponse,
  refreshUserOrgGrants,
} from './userOrgGrants';
import { getPericopeBookVersion, setPericopeBookVersion } from './storage';
import {
  flattenApiPericopeSetGroups,
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
  getMasterDataUpdatedAt,
  setMasterDataUpdatedAt,
  type MasterDataCollection,
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
import {
  BIBLE_TEXT_PHASE,
  resolveBibleTextFullFetchReason,
  startPhase,
} from './syncPhaseTiming';

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

/** Remove chapters from target in place (Tier 2 skip of Tier 1 My Work, #670). */
function subtractBibleChapterGroups(
  target: BibleChapterGroup,
  exclude: BibleChapterGroup,
): void {
  for (const [bibleId, chapters] of exclude) {
    const list = target.get(bibleId);
    if (!list || list.length === 0) continue;
    const drop = new Set(
      chapters.map(chapter => `${chapter.bookId}:${chapter.chapterNumber}`),
    );
    const kept = list.filter(
      chapter => !drop.has(`${chapter.bookId}:${chapter.chapterNumber}`),
    );
    if (kept.length === 0) {
      target.delete(bibleId);
    } else {
      target.set(bibleId, kept);
    }
  }
}

function mapBibleTextRow(
  bibleId: number,
  bookId: number,
  chapterNumber: number,
  verse: ApiVerse,
) {
  if (!Number.isFinite(verse.id) || verse.id <= 0) {
    throw new Error(
      `Bible text sync missing verse id for bible ${bibleId} book ${bookId} ch ${chapterNumber} v ${verse.verseNumber}`,
    );
  }
  return {
    id: verse.id,
    bible_id: bibleId,
    book_id: bookId,
    chapter_number: chapterNumber,
    verse_number: verse.verseNumber,
    text: verse.text,
  };
}

function bibleChapterKey(bookId: number, chapterNumber: number): string {
  return `${bookId}:${chapterNumber}`;
}

function formatMissingBibleTextChapter(
  bibleId: number,
  bookId: number,
  chapterNumber: number,
  reason: string,
): string {
  return `bible ${bibleId} book ${bookId} ch ${chapterNumber} (${reason})`;
}

/** Full-fetch missing-resource 404 — isolate and continue; do not retry. */
function isMissingBibleTextResource404(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

/** Errors that must still abort the chunk so retrySyncStep / auth handling apply. */
function shouldRethrowBibleTextFetchError(error: unknown): boolean {
  return (
    isAuthError(error) ||
    isRetryableApiError(error) ||
    isTransientTransportFailure(error)
  );
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
  let finishedAttempt = 0;
  const totalPhase = startPhase(`${stepName}.total`);

  try {
    for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
      finishedAttempt = attempt;
      const attemptPhase = startPhase(`${stepName}.attempt`);
      try {
        const result = await operation();
        attemptPhase.end({ attempt });
        clearSyncError(errorKey);
        return result;
      } catch (error) {
        attemptPhase.end({ attempt });
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

        // Client 4xx (e.g. accumulated missing bible-text chapters as 404): do not
        // burn retries re-fetching chunks that already succeeded.
        if (isApiError(error) && error.isTerminal) {
          log.error(`${stepName} failed: terminal error`, {
            error: errorMessage,
            status: error.status,
          });
          setSyncError(errorKey, errorMessage);
          throw error;
        }

        if (attempt === MAX_SYNC_ATTEMPTS) {
          log.error(`${stepName} failed after ${MAX_SYNC_ATTEMPTS} attempts`, {
            error: errorMessage,
          });
          if (!isTransientTransportFailure(error)) {
            setSyncError(errorKey, errorMessage);
          }
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
  } finally {
    totalPhase.end({ attempt: finishedAttempt });
  }
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
      persistOrgGrantsFromUserResponse(userIdStr, user);

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

export type SyncMasterDataOptions = {
  /** Skip `updatedAfter` and pull the full catalogues (ISO backfill, etc.). */
  forceFull?: boolean;
};

export type SyncProjectsOptions = {
  /**
   * Fetch real language parents via GET /languages/{id} before project insert
   * so login Tier 1 can skip the full world catalogue (#679). Never advances
   * the global master-data cursor.
   */
  seedFkParents?: boolean;
  /**
   * Warm metadata refresh only. Per-id parent GET failures (404/5xx/network)
   * upsert successes, skip FK-unsafe rows, and report incomplete without
   * aborting later warm steps. Auth errors still throw. Login Tier 1 must
   * omit this so seeding stays strict.
   */
  seedFkParentsBestEffort?: boolean;
};

type SeedFkParentsWorkOptions = {
  seedFkParents?: boolean;
  seedFkParentsBestEffort?: boolean;
};

type FkParentSeedResult = {
  failedIds: number[];
  incompleteReason?: string;
};

function uniquePositiveIds(ids: Array<number | undefined | null>): number[] {
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const id of ids) {
    if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

/**
 * Strict: Promise.all — any failure aborts (login Tier 1).
 * Best-effort: per-id settle; auth still aborts the batch.
 */
async function fetchMasterParentsById<T>(
  ids: number[],
  fetchOne: (id: number) => Promise<T>,
  options: { bestEffort: boolean; kind: string },
): Promise<{ values: T[]; failedIds: number[] }> {
  if (!options.bestEffort) {
    const values = await Promise.all(ids.map(id => fetchOne(id)));
    return { values, failedIds: [] };
  }

  const values: T[] = [];
  const failedIds: number[] = [];
  await Promise.all(
    ids.map(async id => {
      try {
        values.push(await fetchOne(id));
      } catch (error) {
        if (isAuthError(error)) {
          throw error;
        }
        failedIds.push(id);
        const failure = classifyPrepareOfflineParentRefreshFailure(error);
        log.warn('FK parent by-id lookup failed; continuing warm seed', {
          kind: options.kind,
          id,
          classification: failure.classification,
          ...(failure.apiStatus !== undefined
            ? { apiStatus: failure.apiStatus }
            : {}),
        });
      }
    }),
  );
  return { values, failedIds };
}

function incompleteParentSeedReason(
  kind: string,
  failedIds: number[],
): string | undefined {
  if (failedIds.length === 0) return undefined;
  return `Incomplete ${kind} parent refresh (${failedIds.length} failed)`;
}

/**
 * Persist real master rows needed as FK parents. Must never call
 * setMasterDataLastSyncedAt — scoped seed is not a catalogue watermark (#679).
 */
async function seedLanguageParentsForProjects(
  projects: Project[],
  sessionToken?: string,
  options?: { bestEffort?: boolean },
): Promise<FkParentSeedResult> {
  const languageIds = uniquePositiveIds(
    projects.flatMap(project => [
      project.sourceLanguageId ?? project.source_language_id,
      project.targetLanguageId ?? project.target_language_id,
    ]),
  );
  if (languageIds.length === 0) {
    return { failedIds: [] };
  }

  log.info('Seeding project language parents', {
    count: languageIds.length,
    bestEffort: options?.bestEffort === true,
  });

  const { values, failedIds } = await fetchMasterParentsById(
    languageIds,
    id => FluentAPI.getLanguage(id, sessionToken),
    { bestEffort: options?.bestEffort === true, kind: 'language' },
  );
  if (values.length > 0) {
    await insertMasterData(values.map(mapApiLanguage), [], []);
  }
  return {
    failedIds,
    incompleteReason: incompleteParentSeedReason('language', failedIds),
  };
}

async function seedAssignmentMasterParents(
  assignments: ChapterAssignment[],
  sessionToken?: string,
  options?: { bestEffort?: boolean },
): Promise<FkParentSeedResult> {
  const bibleIds = uniquePositiveIds(assignments.map(a => a.bibleId));
  const bookIds = uniquePositiveIds(assignments.map(a => a.bookId));
  if (bibleIds.length === 0 && bookIds.length === 0) {
    return { failedIds: [] };
  }

  const bestEffort = options?.bestEffort === true;
  log.info('Seeding assignment master parents', {
    bibleCount: bibleIds.length,
    bookCount: bookIds.length,
    bestEffort,
  });

  const [booksResult, biblesResult] = await Promise.all([
    fetchMasterParentsById(bookIds, id => FluentAPI.getBook(id, sessionToken), {
      bestEffort,
      kind: 'book',
    }),
    fetchMasterParentsById(
      bibleIds,
      id => FluentAPI.getBible(id, sessionToken),
      { bestEffort, kind: 'bible' },
    ),
  ]);

  const languageIds = uniquePositiveIds(
    biblesResult.values.map(bible => bible.languageId),
  );
  const languagesResult =
    languageIds.length === 0
      ? { values: [], failedIds: [] as number[] }
      : await fetchMasterParentsById(
          languageIds,
          id => FluentAPI.getLanguage(id, sessionToken),
          { bestEffort, kind: 'bible-language' },
        );

  const fetchedLanguageIds = new Set(
    languagesResult.values.map(language => language.id),
  );
  // Bibles need a language FK. Keep ones whose language was fetched or already local.
  const localLanguageIds =
    bestEffort && biblesResult.values.length > 0
      ? await selectExistingIds(
          'languages',
          uniquePositiveIds(biblesResult.values.map(b => b.languageId)),
        )
      : new Set<number>();
  const availableLanguageIds = new Set([
    ...fetchedLanguageIds,
    ...localLanguageIds,
  ]);
  const biblesToInsert = bestEffort
    ? biblesResult.values.filter(bible =>
        availableLanguageIds.has(bible.languageId),
      )
    : biblesResult.values;
  const skippedBibleIds = biblesResult.values
    .filter(bible => !availableLanguageIds.has(bible.languageId))
    .map(bible => bible.id);

  if (
    languagesResult.values.length > 0 ||
    booksResult.values.length > 0 ||
    biblesToInsert.length > 0
  ) {
    await insertMasterData(
      languagesResult.values.map(mapApiLanguage),
      booksResult.values,
      biblesToInsert,
    );
  }

  const failedIds = [
    ...booksResult.failedIds,
    ...biblesResult.failedIds,
    ...languagesResult.failedIds,
    ...skippedBibleIds,
  ];
  return {
    failedIds,
    incompleteReason: incompleteParentSeedReason('assignment', failedIds),
  };
}

async function filterProjectsWithLocalLanguageParents(
  projects: Project[],
): Promise<{ ready: Project[]; skippedCount: number }> {
  const requiredIds = uniquePositiveIds(
    projects.flatMap(project => [
      project.sourceLanguageId ?? project.source_language_id,
      project.targetLanguageId ?? project.target_language_id,
    ]),
  );
  const present = await selectExistingIds('languages', requiredIds);
  const ready: Project[] = [];
  let skippedCount = 0;
  for (const project of projects) {
    const sourceLangId = project.sourceLanguageId ?? project.source_language_id;
    const targetLangId = project.targetLanguageId ?? project.target_language_id;
    if (
      typeof sourceLangId === 'number' &&
      typeof targetLangId === 'number' &&
      present.has(sourceLangId) &&
      present.has(targetLangId)
    ) {
      ready.push(project);
    } else {
      skippedCount += 1;
    }
  }
  return { ready, skippedCount };
}

type MasterDataUpdatedAtRow = {
  updatedAt?: string | null;
  id?: number;
};

function parseUpdatedAtMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Inclusive server filter is `updatedAt >= updatedAfter`. Keep the original
 * server string of the latest parseable `updatedAt` so the next query repeats
 * ties instead of inventing a device watermark. Empty rows or
 * missing/unparseable timestamps keep `prior` and warn (#763).
 */
function maxUpdatedAt(
  rows: ReadonlyArray<MasterDataUpdatedAtRow>,
  prior: string,
  collection: MasterDataCollection,
): string {
  if (rows.length === 0) {
    return prior;
  }

  let best = prior;
  let bestMs = prior ? parseUpdatedAtMs(prior) : null;

  for (const row of rows) {
    const raw = row.updatedAt;
    if (typeof raw !== 'string' || raw.length === 0) {
      log.warn('Master data item missing updatedAt; keeping prior cursor', {
        collection,
        id: row.id,
      });
      return prior;
    }

    const ms = parseUpdatedAtMs(raw);
    if (ms === null) {
      log.warn(
        'Master data item has unparseable updatedAt; keeping prior cursor',
        { collection, id: row.id, updatedAt: raw },
      );
      return prior;
    }

    if (bestMs === null || ms > bestMs) {
      best = raw;
      bestMs = ms;
    }
  }

  return best;
}

export async function syncMasterData(
  sessionToken?: string,
  options?: SyncMasterDataOptions,
) {
  return retrySyncStep(
    'Master data sync',
    KV_KEYS.SYNC_ERROR_MASTER_DATA,
    async () => {
      const storedLanguages = getMasterDataUpdatedAt('languages');
      const storedBooks = getMasterDataUpdatedAt('books');
      const storedBibles = getMasterDataUpdatedAt('bibles');
      const languagesCursor = options?.forceFull
        ? undefined
        : storedLanguages || undefined;
      const booksCursor = options?.forceFull
        ? undefined
        : storedBooks || undefined;
      const biblesCursor = options?.forceFull
        ? undefined
        : storedBibles || undefined;

      log.info('Syncing master data...', {
        languagesCursor: Boolean(languagesCursor),
        booksCursor: Boolean(booksCursor),
        biblesCursor: Boolean(biblesCursor),
      });

      const languages = await FluentAPI.getLanguages(
        languagesCursor,
        sessionToken,
      );
      const books = await FluentAPI.getBooks(booksCursor, sessionToken);
      const bibles = await FluentAPI.getBibles(biblesCursor, sessionToken);

      log.info('Master data fetched', {
        languagesCount: languages?.length,
        booksCount: books?.length,
        biblesCount: bibles?.length,
        languagesCursor: Boolean(languagesCursor),
        booksCursor: Boolean(booksCursor),
        biblesCursor: Boolean(biblesCursor),
      });

      await insertMasterData(
        (languages ?? []).map(mapApiLanguage),
        books,
        bibles,
      );

      setMasterDataUpdatedAt(
        'languages',
        maxUpdatedAt(languages ?? [], storedLanguages, 'languages'),
      );
      setMasterDataUpdatedAt(
        'books',
        maxUpdatedAt(books ?? [], storedBooks, 'books'),
      );
      setMasterDataUpdatedAt(
        'bibles',
        maxUpdatedAt(bibles ?? [], storedBibles, 'bibles'),
      );
      log.info('Master data sync completed');
    },
  );
}

export async function syncProjects(
  userId: number,
  sessionToken?: string,
  options?: SyncProjectsOptions,
): Promise<{ parentSeedIncomplete?: string }> {
  const bestEffort = options?.seedFkParentsBestEffort === true;
  let parentSeedIncomplete: string | undefined;

  await retrySyncStep(
    'Project sync',
    KV_KEYS.SYNC_ERROR_PROJECTS,
    async () => {
      parentSeedIncomplete = undefined;
      log.info('Syncing projects...', { userId });

      const response = await FluentAPI.getUserProjects(userId, sessionToken);
      const raw = unwrapApiListResponse(response);
      const isConfirmedShape = Array.isArray(raw);
      const projects = (isConfirmedShape ? raw : []).map(mapApiProject);

      log.info('Projects fetched', {
        count: projects.length,
        isArray: isConfirmedShape,
      });

      if (options?.seedFkParents && projects.length > 0) {
        const seed = await seedLanguageParentsForProjects(
          projects,
          sessionToken,
          { bestEffort },
        );
        parentSeedIncomplete = seed.incompleteReason;
      }

      let projectsToWrite = projects;
      if (bestEffort && projects.length > 0) {
        const { ready, skippedCount } =
          await filterProjectsWithLocalLanguageParents(projects);
        projectsToWrite = ready;
        if (skippedCount > 0) {
          const skipReason = `Skipped ${skippedCount} project(s) — missing language parents`;
          parentSeedIncomplete = parentSeedIncomplete
            ? `${parentSeedIncomplete}; ${skipReason}`
            : skipReason;
          log.warn('Warm project sync withheld FK-unsafe rows', {
            skippedCount,
            readyCount: ready.length,
          });
        }
      }

      if (projectsToWrite.length > 0) {
        await insertProjects(projectsToWrite);
        await insertUserProjects(
          userId,
          projectsToWrite.map(project => project.id),
        );
      }

      if (isConfirmedShape && projects.length === 0) {
        await reconcileUserMilestones(userId, []);
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
        written: projectsToWrite.length,
        userProjectsInDb: totalProjectsCount,
        parentSeedIncomplete: parentSeedIncomplete ?? null,
      });
    },
    String(userId),
  );

  // retrySyncStep clears SYNC_ERROR_PROJECTS on success — re-assert incomplete
  // after so warm UI does not latch a false healthy projects step.
  if (parentSeedIncomplete) {
    setSyncError(KV_KEYS.SYNC_ERROR_PROJECTS, parentSeedIncomplete);
  }
  return { parentSeedIncomplete };
}

export async function syncMilestones(
  userId: number,
  sessionToken?: string,
  options?: { bestEffort?: boolean },
): Promise<{ milestoneIncomplete?: string }> {
  log.info('Syncing milestones...', { userId });
  const bestEffort = options?.bestEffort === true;

  for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
    try {
      const response = await FluentAPI.getUserMilestones(userId, sessionToken);
      const raw = unwrapApiListResponse(response);
      const isConfirmedShape = Array.isArray(raw);
      const units = (isConfirmedShape ? raw : []).map(mapApiMilestone);

      log.info('Milestones fetched', {
        count: units.length,
        isArray: isConfirmedShape,
        bestEffort,
      });

      if (!isConfirmedShape) {
        const errorMessage = 'Invalid milestones response shape';
        log.warn('Milestone sync failed: unexpected response shape', {
          userId,
        });
        setSyncError(KV_KEYS.SYNC_ERROR_PROJECT_UNITS, errorMessage);
        return {};
      }

      let unitsToUpsert = units;
      let milestoneIncomplete: string | undefined;
      if (bestEffort && units.length > 0) {
        const projectIds = uniquePositiveIds(units.map(unit => unit.projectId));
        const presentProjects = await selectExistingIds('projects', projectIds);
        unitsToUpsert = units.filter(unit =>
          presentProjects.has(unit.projectId),
        );
        const skippedCount = units.length - unitsToUpsert.length;
        if (skippedCount > 0) {
          milestoneIncomplete = `Skipped ${skippedCount} milestone(s) — missing project parents`;
          log.warn('Warm milestone sync withheld FK-unsafe units', {
            skippedCount,
            readyCount: unitsToUpsert.length,
          });
        }
      }

      await upsertProjectUnits(unitsToUpsert);
      // Reconcile against the full confirmed server id list so withheld units
      // that already exist locally are not deleted as "stale".
      await reconcileUserMilestones(
        userId,
        units.map(unit => unit.id),
      );

      if (milestoneIncomplete) {
        setSyncError(KV_KEYS.SYNC_ERROR_PROJECT_UNITS, milestoneIncomplete);
        return { milestoneIncomplete };
      }

      clearSyncError(KV_KEYS.SYNC_ERROR_PROJECT_UNITS);
      return {};
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      if (isAuthError(error)) {
        log.error('Milestone sync failed: session invalid', {
          error: errorMessage,
        });
        setSyncError(KV_KEYS.SYNC_ERROR_PROJECT_UNITS, errorMessage);
        await handleSyncAuthFailure(String(userId));
        throw error;
      }

      // Pre-milestones APIs return 404 — list still works from assignment sync.
      if (isApiError(error) && error.status === 404) {
        clearSyncError(KV_KEYS.SYNC_ERROR_PROJECT_UNITS);
        log.warn(
          'Milestone endpoint unavailable; continuing without milestone ingest',
          { userId },
        );
        return {};
      }

      if (attempt < MAX_SYNC_ATTEMPTS && isRetryableApiError(error)) {
        log.warn('Milestone sync failed, retrying', {
          attempt,
          maxAttempts: MAX_SYNC_ATTEMPTS,
          error: errorMessage,
        });
        await delay(attempt * 500);
        continue;
      }

      clearSyncError(KV_KEYS.SYNC_ERROR_PROJECT_UNITS);
      log.warn('Milestone sync failed; continuing remaining sync steps', {
        error: errorMessage,
        userId,
      });
      return {};
    }
  }
  return {};
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

export async function syncPendingStageAdvancesForUser(
  userId: number,
  token?: string,
) {
  const { isOnline } = await getConnectivitySnapshot();
  if (!isOnline) {
    return { synced: 0, dropped: 0, failed: 0 };
  }

  try {
    return await syncPendingStageAdvances(userId, token);
  } catch (error) {
    if (isAuthError(error)) {
      await handleSyncAuthFailure(String(userId));
      throw error;
    }
    log.warn('Stage-advance sync failed; leaving rows pending', {
      userId,
      error: getErrorMessage(error),
    });
    return { synced: 0, dropped: 0, failed: 1 };
  }
}

export async function syncChapterAssignments(
  userId: number,
  updatedAfter?: string,
  excludeProjectIds?: number[],
  sessionToken?: string,
  options?: { seedFkParentsBestEffort?: boolean },
): Promise<{ syncedAt?: string; partialSkipWarning?: string }> {
  let partialSkipWarning: string | undefined;
  const bestEffort = options?.seedFkParentsBestEffort === true;
  const result = await retrySyncStep(
    'Chapter assignment sync',
    KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS,
    async () => {
      partialSkipWarning = undefined;
      log.info('Syncing chapter assignments...', {
        userId,
        updatedAfter,
        excludeProjectIds,
        bestEffort,
      });

      const pullRevision = getChapterAssignmentPullRevision();
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
          await insertChapterAssignmentSyncData(allAssignments, pullRevision);
        if (insertedCount === 0) {
          const allSkipped = `Skipped all ${skipped.length} chapter assignment(s) — missing FK parents`;
          if (bestEffort) {
            // Warm path: continue to My Work / pericopes with truthful warning.
            partialSkipWarning = allSkipped;
          } else {
            throw new Error(allSkipped);
          }
        } else if (skipped.length > 0) {
          partialSkipWarning = `Skipped ${skipped.length} of ${allAssignments.length} chapter assignment(s) — missing FK parents`;
        }

        const candidateProjectIds = [
          ...new Set(
            allAssignments
              .map((assignment: { projectId: number }) => assignment.projectId)
              .filter(id => Number.isFinite(id) && id > 0),
          ),
        ];
        // Warm: never INSERT user_projects for projects withheld by parent seed
        // (FK). Strict login keeps prior all-candidate behavior.
        const membershipProjectIds = bestEffort
          ? [...(await selectExistingIds('projects', candidateProjectIds))]
          : candidateProjectIds;
        if (membershipProjectIds.length > 0) {
          await insertUserProjects(userId, membershipProjectIds);
        }
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
          membershipProjects: membershipProjectIds.length,
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
  options?: SeedFkParentsWorkOptions,
): Promise<{ partialSkipWarning?: string; parentSeedIncomplete?: string }> {
  let partialSkipWarning: string | undefined;
  let parentSeedIncomplete: string | undefined;
  const bestEffort = options?.seedFkParentsBestEffort === true;
  await retrySyncStep(
    'User chapter work sync',
    KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS,
    async () => {
      partialSkipWarning = undefined;
      parentSeedIncomplete = undefined;
      const pullRevision = getChapterAssignmentPullRevision();
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

      if (options?.seedFkParents && mapped.length > 0) {
        const seed = await seedAssignmentMasterParents(mapped, sessionToken, {
          bestEffort,
        });
        parentSeedIncomplete = seed.incompleteReason;
      }

      if (mapped.length > 0) {
        const { insertedCount, skipped } =
          await insertChapterAssignmentSyncData(mapped, pullRevision);
        if (insertedCount === 0) {
          const allSkipped = `Skipped all ${skipped.length} chapter assignment(s) — missing FK parents`;
          if (bestEffort) {
            // Warm path: keep milestones/pericopes progress; report incomplete.
            partialSkipWarning = allSkipped;
          } else {
            throw new Error(allSkipped);
          }
        } else if (skipped.length > 0) {
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
  return { partialSkipWarning, parentSeedIncomplete };
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
  options?: SeedFkParentsWorkOptions,
): Promise<{
  didFullSync: boolean;
  syncedAt?: string;
  partialSkipWarning?: string;
  parentSeedIncomplete?: string;
}> {
  const userIdStr = String(userId);
  const workOptions: SeedFkParentsWorkOptions | undefined =
    options?.seedFkParents
      ? {
          seedFkParents: true,
          ...(options.seedFkParentsBestEffort
            ? { seedFkParentsBestEffort: true }
            : {}),
        }
      : undefined;
  const catalogueOptions = options?.seedFkParentsBestEffort
    ? { seedFkParentsBestEffort: true as const }
    : undefined;

  const runFullProjectAssignments = async () => {
    const projectResult = await syncChapterAssignments(
      userId,
      undefined,
      undefined,
      sessionToken,
      catalogueOptions,
    );
    const workResult = await syncUserChapterWork(
      userId,
      sessionToken,
      workOptions,
    );
    const partialSkipWarning = applyChapterAssignmentSkipWarning(
      workResult.partialSkipWarning,
      projectResult.partialSkipWarning,
    );
    const parentSeedIncomplete = workResult.parentSeedIncomplete;
    if (parentSeedIncomplete) {
      // Prefer assignment-skip text when both exist; otherwise surface seed gap.
      if (!partialSkipWarning) {
        setSyncError(
          KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS,
          parentSeedIncomplete,
        );
      }
    }
    return {
      // Withhold cursor advancement when skips/incomplete parent refresh remain
      // so the next sync re-fetches instead of false recovery (#470).
      syncedAt:
        partialSkipWarning || parentSeedIncomplete
          ? undefined
          : projectResult.syncedAt,
      partialSkipWarning,
      parentSeedIncomplete,
    };
  };

  let result: {
    didFullSync: boolean;
    syncedAt?: string;
    partialSkipWarning?: string;
    parentSeedIncomplete?: string;
  };

  if (!getUserLastSyncedAt(userIdStr)) {
    log.info(
      'Forcing full chapter assignment sync — user has no per-user sync cursor',
      { userId },
    );
    const full = await runFullProjectAssignments();
    result = { didFullSync: true, ...full };
  } else if (
    (updatedAfter && !(await userHasLocalChapterAssignments(userId))) ||
    (await userNeedsAssigneeRepair(userId))
  ) {
    log.info(
      'Forcing full chapter assignment sync — local assignments incomplete',
      { userId },
    );
    const full = await runFullProjectAssignments();
    result = { didFullSync: true, ...full };
  } else {
    const projectResult = await syncChapterAssignments(
      userId,
      updatedAfter,
      undefined,
      sessionToken,
      catalogueOptions,
    );
    const workResult = await syncUserChapterWork(
      userId,
      sessionToken,
      workOptions,
    );
    const partialSkipWarning = applyChapterAssignmentSkipWarning(
      workResult.partialSkipWarning,
      projectResult.partialSkipWarning,
    );
    const parentSeedIncomplete = workResult.parentSeedIncomplete;
    if (parentSeedIncomplete && !partialSkipWarning) {
      setSyncError(
        KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS,
        parentSeedIncomplete,
      );
    }
    result = {
      didFullSync: !updatedAfter,
      syncedAt:
        partialSkipWarning || parentSeedIncomplete
          ? undefined
          : projectResult.syncedAt,
      partialSkipWarning,
      parentSeedIncomplete,
    };
  }

  // Post-pull (#610): persist has_conflict for claim-404 rows (the pull above
  // may have cleared it) and for pending claims now held by someone else.
  await reconcilePendingClaimsAfterAssignmentPull(userId);
  return result;
}

export type SyncBibleTextsOptions = {
  /** When set, sync only these chapters instead of all local assignments (#670). */
  chapterGroups?: BibleChapterGroup;
  /**
   * Drop these chapters from an otherwise unscoped sync (Tier 2 after My Work
   * texts already ran). Still counts as unscoped for server-id remap clear.
   */
  excludeChapterGroups?: BibleChapterGroup;
  /**
   * Known/eligible account ids whose `user_projects` membership scopes the
   * full-catalogue chapter selection when `chapterGroups` is omitted.
   */
  eligibleUserIds?: number[];
};

export async function syncBibleTexts(
  updatedAfter?: string,
  options?: SyncBibleTextsOptions,
) {
  let maxCommittedChunks = 0;
  return retrySyncStep(
    'Bible text sync',
    KV_KEYS.SYNC_ERROR_BIBLE_TEXTS,
    async () => {
      log.info('Syncing bible texts...');
      // `chunks` here is already-committed chunk count from prior attempts.
      startPhase(BIBLE_TEXT_PHASE.reentry).end({ chunks: maxCommittedChunks });
      let committedThisAttempt = 0;

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

      // Bare UI callers (e.g. DraftingScreen ensure) omit eligibleUserIds — scope
      // to the active account only. Multi-account syncAllUsers must pass the
      // known-user union explicitly; do not fall back to snapshotKnownUserIds().
      // getActiveUserId() returns '' when unset — reject before Number('') → 0.
      const activeRaw = getActiveUserId();
      const activeUserId = Number(activeRaw);
      const defaultEligibleUserIds =
        activeRaw !== '' && Number.isFinite(activeUserId) ? [activeUserId] : [];
      // Remap clear is global after a successful getChaptersToSync pass — cover
      // every known account's chapters (same union idea as syncAllUsers), not
      // just eligibleUserIds / active-only. Scoped chapterGroups passes keep
      // remap pending and do not use this path.
      let catalogueEligibleUserIds =
        options?.eligibleUserIds ?? defaultEligibleUserIds;
      if (remapPending && !options?.chapterGroups) {
        const knownUserIds = getKnownUserIds() ?? [];
        const idsForRemap =
          knownUserIds.length > 0
            ? knownUserIds
            : activeRaw !== ''
            ? [activeRaw]
            : [];
        catalogueEligibleUserIds = idsForRemap
          .map(id => Number(id))
          .filter(id => Number.isFinite(id));
      }
      const bibleGroups =
        options?.chapterGroups ??
        (await getChaptersToSync(catalogueEligibleUserIds));
      // Tier 2 (#670): skip My Work chapters already fetched in Tier 1 without
      // switching to a scoped pass (scoped passes must not clear remap).
      if (!options?.chapterGroups && options?.excludeChapterGroups) {
        subtractBibleChapterGroups(bibleGroups, options.excludeChapterGroups);
      }
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
        // Tier 2 exclude emptied the set after My Work texts already landed
        // (#670). Do not zero the global bible count, and clear remap only on
        // this unscoped remainder path once recording-linked merge (above)
        // also left nothing — coverage was Tier 1 + empty remainder.
        if (!options?.chapterGroups && options?.excludeChapterGroups) {
          const db = getDatabase();
          const result = await db.execute(
            'SELECT COUNT(DISTINCT bible_id) as count FROM bible_texts',
          );
          setSyncCount(
            KV_KEYS.SYNC_COUNT_BIBLES,
            Number(result.rows?.[0]?.count || 0),
          );
          if (remapPending) {
            clearBibleTextsServerIdRemapPending();
          }
          return;
        }
        setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, 0);
        return;
      }

      log.info('Chapters to sync grouped by bible', {
        bibleCount: bibleGroups.size,
      });

      let totalTextsInserted = 0;
      const missingChapterFailures: string[] = [];
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
          let missingChapter = false;
          if (cursorForSync) {
            const countCheck = startPhase(BIBLE_TEXT_PHASE.countCheck);
            try {
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
                  missingChapter = true;
                  cursor = undefined;
                  break;
                }
              }
            } finally {
              countCheck.end({
                rows: chunk.length,
                chunks: chunkIndex,
                fullFetchReason: resolveBibleTextFullFetchReason(
                  updatedAfter,
                  remapPending,
                  missingChapter,
                ),
              });
            }
          }

          const isFullFetch = !cursor;
          const fullFetchReason = resolveBibleTextFullFetchReason(
            updatedAfter,
            remapPending,
            missingChapter,
          );

          log.info('Fetching chunk', {
            bibleId,
            chunkIndex,
            chunkSize: chunk.length,
            incremental: Boolean(cursor),
          });

          const fetchParse = startPhase(BIBLE_TEXT_PHASE.fetchParse);
          let books: ApiBook[];
          let textsWithBibleId: Array<{
            bibleId: number;
            bookId: number;
            chapterNumber: number;
            verses: ReturnType<typeof mapBibleTextRow>[];
          }> = [];
          let chunkVerseCount = 0;
          try {
            try {
              const response = await FluentAPI.getBibleTexts(
                bibleId,
                chunk,
                cursor,
              );
              books = response.data;
            } catch (error) {
              if (shouldRethrowBibleTextFetchError(error)) {
                throw error;
              }
              if (isFullFetch && isMissingBibleTextResource404(error)) {
                for (const chapter of chunk) {
                  missingChapterFailures.push(
                    formatMissingBibleTextChapter(
                      bibleId,
                      chapter.bookId,
                      chapter.chapterNumber,
                      '404',
                    ),
                  );
                }
                log.warn(
                  'Full bible text fetch returned 404; recording missing chapters',
                  {
                    bibleId,
                    chunkIndex,
                    chapterCount: chunk.length,
                  },
                );
                continue;
              }
              throw error;
            }

            if (!Array.isArray(books)) {
              throw new Error(
                `Invalid bible text response for bible ${bibleId}`,
              );
            }

            if (isFullFetch) {
              const returnedByKey = new Map<string, ApiBook>();
              for (const book of books) {
                returnedByKey.set(
                  bibleChapterKey(book.bookId, book.chapterNumber),
                  book,
                );
              }
              for (const chapter of chunk) {
                const returned = returnedByKey.get(
                  bibleChapterKey(chapter.bookId, chapter.chapterNumber),
                );
                const hasVerses =
                  returned !== undefined &&
                  Array.isArray(returned.verses) &&
                  returned.verses.length > 0;
                if (!hasVerses) {
                  missingChapterFailures.push(
                    formatMissingBibleTextChapter(
                      bibleId,
                      chapter.bookId,
                      chapter.chapterNumber,
                      returned === undefined
                        ? 'absent from full-fetch response'
                        : 'empty verses',
                    ),
                  );
                }
              }
            }

            // Skip chapters with no verses before insert (full-fetch also records
            // them as missing above).
            const booksToInsert = books.filter(
              (book: ApiBook) =>
                Array.isArray(book.verses) && book.verses.length > 0,
            );

            textsWithBibleId = booksToInsert.map((book: ApiBook) => ({
              bibleId,
              bookId: book.bookId,
              chapterNumber: book.chapterNumber,
              verses: book.verses.map((verse: ApiVerse) =>
                mapBibleTextRow(
                  bibleId,
                  book.bookId,
                  book.chapterNumber,
                  verse,
                ),
              ),
            }));

            chunkVerseCount = textsWithBibleId.reduce(
              (count, book) => count + book.verses.length,
              0,
            );
          } finally {
            fetchParse.end({
              rows: chunkVerseCount,
              chunks: chunkIndex,
              fullFetchReason,
            });
          }

          const write = startPhase(BIBLE_TEXT_PHASE.write);
          try {
            await insertBibleTexts(textsWithBibleId);
            committedThisAttempt += 1;
            if (committedThisAttempt > maxCommittedChunks) {
              maxCommittedChunks = committedThisAttempt;
            }
            totalTextsInserted += chunkVerseCount;
            log.info('Chunk synced', {
              bibleId,
              chunkIndex,
              versesInserted: chunkVerseCount,
            });
          } finally {
            write.end({
              rows: chunkVerseCount,
              chunks: chunkIndex,
              fullFetchReason,
            });
          }
        }
      }

      const result = await db.execute(
        'SELECT COUNT(DISTINCT bible_id) as count FROM bible_texts',
      );
      const uniqueBiblesCount = result.rows?.[0]?.count || 0;
      setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, Number(uniqueBiblesCount));

      if (missingChapterFailures.length > 0) {
        log.warn('Bible texts sync finished with missing chapters', {
          textsInserted: totalTextsInserted,
          uniqueBiblesInDb: uniqueBiblesCount,
          missingChapterCount: missingChapterFailures.length,
        });
        throw new ApiError(
          404,
          `Missing bible text chapter(s): ${missingChapterFailures.join('; ')}`,
        );
      }

      log.info('Bible texts sync completed', {
        textsInserted: totalTextsInserted,
        uniqueBiblesInDb: uniqueBiblesCount,
      });

      // Scoped Tier 1 (#670) must not clear remap — catalogue chapters still
      // need an unscoped full fetch before old verse ids are safe to leave.
      if (remapPending && !options?.chapterGroups) {
        clearBibleTextsServerIdRemapPending();
      }
    },
  );
}

export async function syncPericopeSets(sessionToken?: string) {
  return retrySyncStep(
    'Pericope sets sync',
    KV_KEYS.SYNC_ERROR_PERICOPE_SETS,
    async () => {
      const sets = await FluentAPI.getPericopeSets(sessionToken);
      await insertPericopeSets(sets);
      log.info('Pericope sets synced', { count: sets.length });
    },
  );
}

/**
 * Set-level pericope hydrate (Refs #438 / #587).
 *
 * Per-chapter GETs are forbidden by the #438 bandwidth contract. Prefer the
 * APK-bundled FCBH/FIA assets (#447); for any other `pericope_set_id` (or a
 * book missing from the bundle), call `GET /pericope-sets/{id}?bookCode=` with
 * `If-None-Match` against the KV book version (stored ETag).
 */
export async function syncPericopes(
  sessionToken?: string,
  failingUserId?: string,
) {
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
        const distinctBookCodes = [
          ...new Set(setChapters.map(c => c.bookCode)),
        ];

        for (const bookCode of distinctBookCodes) {
          const storedBookVersion = getPericopeBookVersion(
            pericopeSetId,
            bookCode,
          );

          if (bundledVersion) {
            if (storedBookVersion === bundledVersion) {
              log.info('Pericope book already current, skipping reseed', {
                pericopeSetId,
                bookCode,
              });
              continue;
            }

            const verses = loadBundledPericopeSet(pericopeSetId, bookCode);
            if (verses) {
              await upsertPericopeSet(pericopeSetId, bookCode, verses);
              setPericopeBookVersion(pericopeSetId, bookCode, bundledVersion);
              continue;
            }

            log.info(
              'Book missing from bundled set — falling back to GET /pericope-sets/{id}',
              { pericopeSetId, bookCode },
            );
          }

          const result = await FluentAPI.getPericopeSet(
            pericopeSetId,
            {
              bookCode,
              etag: storedBookVersion || null,
            },
            sessionToken,
          );

          if (result.status === 304) {
            log.info('Pericope book not modified (304)', {
              pericopeSetId,
              bookCode,
            });
            if (result.etag) {
              setPericopeBookVersion(pericopeSetId, bookCode, result.etag);
            }
            continue;
          }

          const groups = Array.isArray(result.data) ? result.data : [];
          const verses = flattenApiPericopeSetGroups(groups);
          if (verses.length > 0) {
            await upsertPericopeSet(pericopeSetId, bookCode, verses);
          }
          if (result.etag) {
            setPericopeBookVersion(pericopeSetId, bookCode, result.etag);
          } else {
            log.warn('Pericope set 200 missing ETag — will refetch next sync', {
              pericopeSetId,
              bookCode,
            });
          }
        }
      }
    },
    failingUserId,
  );
}

type FullSyncKind = 'users' | 'incremental' | 'login';

type FullSyncEntry = {
  kind: FullSyncKind;
  /** User ids this pass covers, captured when the pass was enqueued. */
  userIds: ReadonlySet<string>;
  promise: Promise<void>;
};

/**
 * Most recently enqueued full sync (running or waiting its turn). Full syncs
 * are serialized so Sync Now / login never overlap; only passes that would do
 * identical work join an existing one.
 */
let latestFullSync: FullSyncEntry | null = null;

function snapshotKnownUserIds(): Set<string> {
  const known = getKnownUserIds() ?? [];
  if (known.length > 0) return new Set(known);
  const activeUserId = getActiveUserId();
  return new Set(activeUserId ? [activeUserId] : []);
}

function snapshotIncrementalUserIds(): Set<string> {
  const userId = getUserIdSync();
  return new Set(userId ? [userId] : []);
}

function isSubset(
  needed: ReadonlySet<string>,
  covered: ReadonlySet<string>,
): boolean {
  if (needed.size === 0) return false;
  for (const id of needed) {
    if (!covered.has(id)) return false;
  }
  return true;
}

/**
 * Join only a duplicate Sync Now / incremental pass whose user set is already
 * covered. Login / add-account (`syncAllData(false)`) is never joined — it must
 * run `syncUser` / `insertUser` for the new account.
 */
function canJoinFullSync(
  existing: FullSyncEntry,
  kind: FullSyncKind,
  userIds: ReadonlySet<string>,
): boolean {
  if (kind === 'login' || existing.kind === 'login') return false;
  if (kind === 'users' && existing.kind !== 'users') return false;
  return isSubset(userIds, existing.userIds);
}

function runFullSyncSingleFlight(
  label: string,
  kind: FullSyncKind,
  userIds: ReadonlySet<string>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = latestFullSync;
  if (previous && canJoinFullSync(previous, kind, userIds)) {
    log.info(`${label} joined in-flight full sync`);
    return previous.promise;
  }

  if (previous) {
    log.info(`${label} waiting for in-flight full sync`);
  }
  const start = previous
    ? previous.promise.then(
        () => undefined,
        () => undefined,
      )
    : Promise.resolve();

  const entry: FullSyncEntry = {
    kind,
    userIds,
    promise: start.then(run).finally(() => {
      if (latestFullSync === entry) {
        latestFullSync = null;
      }
    }),
  };
  latestFullSync = entry;
  return entry.promise;
}

/** Test-only: clear single-flight state between cases. */
export function __resetFullSyncSingleFlightForTests(): void {
  latestFullSync = null;
}

/** Avoid unhandled rejection if a later sync step throws before awaiting master. */
async function settleMasterPromise(
  masterPromise: Promise<void> | undefined,
): Promise<void> {
  if (!masterPromise) return;
  await masterPromise.catch(() => undefined);
}

export async function syncAllUsers(): Promise<void> {
  return runFullSyncSingleFlight(
    'syncAllUsers',
    'users',
    snapshotKnownUserIds(),
    async () => {
      log.info('Syncing all users...');
      clearAllSyncErrors();
      emitSyncStart();

      const currentActiveUserId = getActiveUserId();
      let masterPromise: Promise<void> | undefined;

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

        // Fetch master data in parallel with pending claims. Await it before
        // projects/assignments — those inserts FK to languages/books/bibles.
        masterPromise = syncMasterData(activeCreds?.token);

        type UserCreds = { userId: string; userIdNum: number; token: string };
        const usersWithCreds: UserCreds[] = [];

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
          usersWithCreds.push({
            userId,
            userIdNum: Number(userId),
            token: creds.token,
          });
        }

        for (const { userId, userIdNum } of usersWithCreds) {
          try {
            await syncPendingChapterClaimsForUser(userIdNum);
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
            log.error('Claim sync failed for user', {
              userId,
              error: getErrorMessage(error),
            });
          }
        }

        await masterPromise;
        await syncPericopeSets(activeCreds?.token);

        for (const { userId, userIdNum, token } of usersWithCreds) {
          log.info('Syncing user', { userId });
          const userLastSyncedAt = getUserLastSyncedAt(userId) || undefined;
          const hasUserProjects = await userHasLocalProjects(userIdNum);
          const assignmentCursor = hasUserProjects
            ? userLastSyncedAt
            : undefined;

          try {
            await refreshUserOrgGrants(userId, token);
            await syncProjects(userIdNum, token);
            await syncMilestones(userIdNum, token);
            const { didFullSync, partialSkipWarning } =
              await syncChapterAssignmentsForUser(
                userIdNum,
                assignmentCursor,
                token,
              );
            // Drain after the pull so keep-lower writes are not overwritten
            // once the pending-row upsert freeze is gone. Rows with pending
            // takes stay queued until those uploads finish (#257).
            await syncPendingStageAdvancesForUser(userIdNum, token);
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
        const eligibleUserIds = userIdsToSync
          .map(id => Number(id))
          .filter(id => Number.isFinite(id));
        await syncBibleTexts(bibleTextUpdatedAfter, { eligibleUserIds });

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
        await settleMasterPromise(masterPromise);
        log.error('Sync all users failed', { error: getErrorMessage(error) });
        throw error;
      } finally {
        emitSyncComplete();
      }
    },
  );
}

export type SyncAllDataOptions = {
  /**
   * Fired after Tier 1 (My Work usable) on login so Home can clear the
   * full-screen spinner while Tier 2 continues (#670).
   */
  onTier1Complete?: () => void;
};

export async function syncAllData(
  isIncremental = false,
  email?: string,
  preloadedUser?: ApiUser,
  options?: SyncAllDataOptions,
) {
  return runFullSyncSingleFlight(
    'syncAllData',
    isIncremental ? 'incremental' : 'login',
    isIncremental ? snapshotIncrementalUserIds() : new Set<string>(),
    async () => {
      log.info('Starting sync...', { isIncremental });
      clearAllSyncErrors();
      emitSyncStart();

      let masterPromise: Promise<void> | undefined;
      let tier1Notified = false;
      const notifyTier1Complete = () => {
        if (tier1Notified) return;
        tier1Notified = true;
        options?.onTier1Complete?.();
      };

      try {
        let userId: number;
        let sessionToken: string | undefined;
        let grantsRefreshPromise: Promise<void> | undefined;
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
          // Warm Sync Now: do not await grants before claims∥master (#771).
          // Kick off refresh here; awaited alongside claims below.
          grantsRefreshPromise = refreshUserOrgGrants(
            existingUserIdStr,
            sessionToken,
          );
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
        const userAssignmentCursor =
          getUserLastSyncedAt(userIdStr) || undefined;

        let assignmentPartialSkipWarning: string | undefined;
        let bibleTextUpdatedAfter: string | undefined;

        if (isIncremental) {
          // Warm Sync Now: claims overlap master fetch; projects wait for both.
          // Org-grant refresh runs with claims so getUserByEmail does not
          // serialize ahead of the #771 overlap.
          masterPromise = syncMasterData(sessionToken);
          // grantsRefreshPromise is always assigned in the isIncremental branch above.
          await Promise.all([
            syncPendingChapterClaimsForUser(userId),
            grantsRefreshPromise!,
          ]);
          await masterPromise;
          await syncPericopeSets(sessionToken);
          await syncProjects(userId, sessionToken);
          await syncMilestones(userId, sessionToken);

          const assignmentCursor = userAssignmentCursor ?? lastSyncedAt;
          const { didFullSync, partialSkipWarning } =
            await syncChapterAssignmentsForUser(
              userId,
              assignmentCursor,
              sessionToken,
            );
          assignmentPartialSkipWarning = partialSkipWarning;
          bibleTextUpdatedAfter = didFullSync ? undefined : assignmentCursor;
          await syncPericopes();
          await syncBibleTexts(bibleTextUpdatedAfter, {
            eligibleUserIds: [userId],
          });
          notifyTier1Complete();
        } else if (localProjectIdsBefore.length === 0) {
          // Login Tier 1 (#679): seed only FK parents My Work needs — do not
          // await the full world catalogue before Home unblocks.
          await syncPendingChapterClaimsForUser(userId);
          await syncPericopeSets(sessionToken);
          await syncProjects(userId, sessionToken, { seedFkParents: true });
          await syncMilestones(userId, sessionToken);

          const workResult = await syncUserChapterWork(userId, sessionToken, {
            seedFkParents: true,
          });
          assignmentPartialSkipWarning = applyChapterAssignmentSkipWarning(
            workResult.partialSkipWarning,
          );
          bibleTextUpdatedAfter = undefined;
          await reconcilePendingClaimsAfterAssignmentPull(userId);
          await syncPericopes();
          const myWorkChapterGroups = await getMyWorkChaptersToSync(userId);
          await syncBibleTexts(undefined, {
            chapterGroups: myWorkChapterGroups,
          });
          notifyTier1Complete();

          // Full master after Tier 1; await before Tier 2 assignment catalogue.
          masterPromise = syncMasterData(sessionToken);
          await masterPromise;

          // Tier 2: full project assignment catalogue + remaining bible texts.
          log.info('Login Tier 2: project assignments + remaining bible texts');
          const projectResult = await syncChapterAssignments(
            userId,
            undefined,
            undefined,
            sessionToken,
          );
          assignmentPartialSkipWarning = applyChapterAssignmentSkipWarning(
            assignmentPartialSkipWarning,
            projectResult.partialSkipWarning,
          );
          await reconcilePendingClaimsAfterAssignmentPull(userId);
          // Catalogue books from Tier 2 assignments need pericopes too (#670).
          // Already-current books skip via stored pericope book version.
          await syncPericopes();
          // Skip My Work chapters already fetched in Tier 1; keep unscoped so
          // server-id remap can still clear after remaining + recording-linked.
          await syncBibleTexts(undefined, {
            excludeChapterGroups: myWorkChapterGroups,
            eligibleUserIds: [userId],
          });
        } else {
          // Re-login (#670/#679): My Work + scoped seeds first; full catalogue
          // after Tier 1 so Home is not blocked on world languages/books/bibles.
          await syncPendingChapterClaimsForUser(userId);
          await syncPericopeSets(sessionToken);
          await syncProjects(userId, sessionToken, { seedFkParents: true });
          await syncMilestones(userId, sessionToken);

          const workResult = await syncUserChapterWork(userId, sessionToken, {
            seedFkParents: true,
          });
          assignmentPartialSkipWarning = applyChapterAssignmentSkipWarning(
            workResult.partialSkipWarning,
          );
          await reconcilePendingClaimsAfterAssignmentPull(userId);
          const myWorkTextCursor = getUserLastSyncedAt(userIdStr)
            ? userAssignmentCursor
            : undefined;
          await syncPericopes();
          const myWorkChapterGroups = await getMyWorkChaptersToSync(userId);
          await syncBibleTexts(myWorkTextCursor, {
            chapterGroups: myWorkChapterGroups,
          });
          notifyTier1Complete();

          masterPromise = syncMasterData(sessionToken);
          await masterPromise;

          // Tier 2: remaining assignment catalogue + texts (and pericopes for
          // chapters added by that catalogue pull).
          log.info('Login Tier 2: remaining assignments + bible texts');
          let didFullAssignmentSync = false;
          if (
            !getUserLastSyncedAt(userIdStr) ||
            (userAssignmentCursor &&
              !(await userHasLocalChapterAssignments(userId))) ||
            (await userNeedsAssigneeRepair(userId))
          ) {
            const projectResult = await syncChapterAssignments(
              userId,
              undefined,
              undefined,
              sessionToken,
            );
            assignmentPartialSkipWarning = applyChapterAssignmentSkipWarning(
              assignmentPartialSkipWarning,
              projectResult.partialSkipWarning,
            );
            didFullAssignmentSync = true;
          } else {
            const projectResult = await syncChapterAssignments(
              userId,
              userAssignmentCursor,
              undefined,
              sessionToken,
            );
            assignmentPartialSkipWarning = applyChapterAssignmentSkipWarning(
              assignmentPartialSkipWarning,
              projectResult.partialSkipWarning,
            );
            didFullAssignmentSync = !userAssignmentCursor;
          }
          await reconcilePendingClaimsAfterAssignmentPull(userId);
          await syncPericopes();
          bibleTextUpdatedAfter = didFullAssignmentSync
            ? undefined
            : userAssignmentCursor;
          await syncBibleTexts(bibleTextUpdatedAfter, {
            excludeChapterGroups: myWorkChapterGroups,
            eligibleUserIds: [userId],
          });
        }

        await syncPendingStageAdvancesForUser(userId, sessionToken);

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
        const bookCount = await db.execute(
          'SELECT COUNT(*) as count FROM books',
        );
        const bibleCount = await db.execute(
          'SELECT COUNT(*) as count FROM bibles',
        );
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
        notifyTier1Complete();
      } catch (error) {
        await settleMasterPromise(masterPromise);
        notifyTier1Complete();
        log.error('Sync failed', { error: getErrorMessage(error) });
        throw error;
      } finally {
        emitSyncComplete();
      }
    },
  );
}

const inFlightMetadataRefresh = new Map<number, Promise<void>>();

/** Skip repeated full master-data pulls after a successful backfill this session. */
let masterDataBackfilledThisSession = false;

export type RefreshPrepareOfflineReferencedParentsResult =
  | 'ok'
  | 'offline'
  | 'skipped'
  | 'failed';

function classifyPrepareOfflineParentRefreshFailure(error: unknown): {
  classification: 'auth' | 'api' | 'type' | 'error' | 'unknown';
  apiStatus?: number;
} {
  if (isAuthError(error)) {
    return { classification: 'auth' };
  }
  if (isApiError(error)) {
    const status = error.status;
    const apiStatus =
      Number.isInteger(status) &&
      (status === 0 || (status >= 100 && status <= 599))
        ? status
        : undefined;
    return {
      classification: 'api',
      ...(apiStatus !== undefined ? { apiStatus } : {}),
    };
  }
  if (error instanceof TypeError) {
    return { classification: 'type' };
  }
  if (error instanceof Error) {
    return { classification: 'error' };
  }
  return { classification: 'unknown' };
}

/**
 * Narrow Prepare Offline repair: gather by-id GETs for the current project's
 * language parents and selected bible/book(+bible-language) ids, then one
 * insertMasterData after an active-user recheck. Does not use the login/warm
 * seed helpers' write path (those callers stay unchanged).
 *
 * Never claims, never syncProjects/reconcile, never bible-text/upload/download,
 * never advances master-data watermarks. Offline / auth / membership misses do
 * not throw — caller must not latch success except on `'ok'`.
 */
export async function refreshPrepareOfflineReferencedParents(params: {
  userId: number;
  projectId: number;
  chapters: Array<{ bibleId: number; bookId: number }>;
}): Promise<RefreshPrepareOfflineReferencedParentsResult> {
  const { userId, projectId, chapters } = params;

  try {
    const { isOnline } = await getConnectivitySnapshot();
    if (!isOnline) {
      return 'offline';
    }

    const userIdStr = String(userId);
    if (userIdStr !== getActiveUserId()) {
      log.warn(
        'Skipping Prepare Offline referenced-parent refresh — user is no longer active',
        { userId, projectId },
      );
      return 'skipped';
    }

    const creds = await getCredentials(userIdStr);
    if (!creds?.token) {
      return 'failed';
    }

    const sessionToken = creds.token;
    const response = await FluentAPI.getUserProjects(userId, sessionToken);
    const raw = unwrapApiListResponse(response);
    if (!Array.isArray(raw)) {
      return 'failed';
    }

    const project = raw.map(mapApiProject).find(row => row.id === projectId);
    if (!project) {
      return 'skipped';
    }

    const projectLanguageIds = uniquePositiveIds([
      project.sourceLanguageId ?? project.source_language_id,
      project.targetLanguageId ?? project.target_language_id,
    ]);
    const bibleIds = uniquePositiveIds(chapters.map(ch => ch.bibleId));
    const bookIds = uniquePositiveIds(chapters.map(ch => ch.bookId));

    // Gather all required GETs first — no SQLite writes until the active-user
    // recheck below (avoids cross-account upsert after account switch).
    const [projectLanguages, books, bibles] = await Promise.all([
      Promise.all(
        projectLanguageIds.map(id => FluentAPI.getLanguage(id, sessionToken)),
      ),
      Promise.all(bookIds.map(id => FluentAPI.getBook(id, sessionToken))),
      Promise.all(bibleIds.map(id => FluentAPI.getBible(id, sessionToken))),
    ]);

    const projectLanguageIdSet = new Set(projectLanguageIds);
    const bibleLanguageIds = uniquePositiveIds(
      bibles.map(bible => bible.languageId),
    ).filter(id => !projectLanguageIdSet.has(id));
    const bibleLanguages =
      bibleLanguageIds.length === 0
        ? []
        : await Promise.all(
            bibleLanguageIds.map(id => FluentAPI.getLanguage(id, sessionToken)),
          );

    if (userIdStr !== getActiveUserId()) {
      log.warn(
        'Skipping Prepare Offline referenced-parent upsert — user changed during fetch',
        { userId, projectId },
      );
      return 'skipped';
    }

    const languagesById = new Map(
      [...projectLanguages, ...bibleLanguages]
        .map(mapApiLanguage)
        .map(language => [language.id, language] as const),
    );

    // Single transaction: languages before books before bibles.
    await insertMasterData([...languagesById.values()], books, bibles);

    if (userIdStr !== getActiveUserId()) {
      log.warn(
        'Skipping Prepare Offline referenced-parent ok — user changed during upsert',
        { userId, projectId },
      );
      return 'skipped';
    }

    return 'ok';
  } catch (error) {
    if (isAuthError(error)) {
      await handleSyncAuthFailure(String(userId));
    }
    const failure = classifyPrepareOfflineParentRefreshFailure(error);
    log.warn('Prepare Offline referenced-parent refresh failed', {
      userId,
      projectId,
      classification: failure.classification,
      ...(failure.apiStatus !== undefined
        ? { apiStatus: failure.apiStatus }
        : {}),
    });
    return 'failed';
  }
}

async function maybeBackfillMasterDataOnRefresh(
  sessionToken?: string,
): Promise<void> {
  if (masterDataBackfilledThisSession) return;
  const needsIso = await hasLanguagesMissingIsoCode();
  if (!needsIso) {
    masterDataBackfilledThisSession = true;
    return;
  }
  emitSyncStart();
  try {
    await syncMasterData(sessionToken, { forceFull: true });
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
      // Push offline claims before assignment reconcile so list refresh does
      // not clear provisional "mine" ahead of the claim POST (#611 / #273).
      await syncPendingChapterClaimsForUser(userId);
      // One-shot ISO backfill for devices that synced languages before
      // mapApiLanguage. Verse text stays on Sync Now / DraftingScreen ensure.
      // NULL/blank ISO only — wrong non-empty codes need #679 by-id seed below.
      await maybeBackfillMasterDataOnRefresh(sessionToken);
      await refreshUserOrgGrants(userIdStr, sessionToken);
      // Re-upsert project/assignment language+bible parents from live API so
      // stale catalogue rows (wrong ISO / bible.language_id) cannot poison
      // Prepare Offline manifests. Does not advance master cursors (#679).
      // Warm-only best-effort: one 404/502 parent lookup must not abort
      // milestones / assignments / pericopes (login Tier 1 stays strict).
      const { parentSeedIncomplete: projectParentIncomplete } =
        await syncProjects(userId, sessionToken, {
          seedFkParents: true,
          seedFkParentsBestEffort: true,
        });
      const { milestoneIncomplete } = await syncMilestones(
        userId,
        sessionToken,
        { bestEffort: true },
      );

      const cursor = getUserLastSyncedAt(userIdStr) || undefined;
      const {
        syncedAt,
        parentSeedIncomplete: assignmentParentIncomplete,
        partialSkipWarning: assignmentSkipWarning,
      } = await syncChapterAssignmentsForUser(userId, cursor, sessionToken, {
        seedFkParents: true,
        seedFkParentsBestEffort: true,
      });
      await syncPendingStageAdvancesForUser(userId, sessionToken);
      // Incomplete parent/milestone/assignment refresh must not latch cursor.
      if (
        syncedAt &&
        !projectParentIncomplete &&
        !milestoneIncomplete &&
        !assignmentParentIncomplete &&
        !assignmentSkipWarning
      ) {
        setUserLastSyncedAt(userIdStr, syncedAt);
      }
      // New chapters from this light refresh need set-level pericope hydrate
      // (#438 / #766). Warm All-synced sessions have no Sync Now; bible text
      // already has a DraftingScreen ensure — pericopes must not wait for login.
      // Pass the captured session token so unbundled set GETs keep #294 isolation.
      await syncPericopes(sessionToken, userIdStr);
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
      // Home useSyncStatus resamples metadata sync_error_* on this event;
      // refresh clears (or sets) those keys without bumping refreshKey.
      emitSyncComplete();
    }
  })();

  inFlightMetadataRefresh.set(userId, refreshPromise);
  return refreshPromise;
}

export async function syncBibleTextsForChapters(
  chapters: Array<{ bibleId: number; bookId: number; chapterNumber: number }>,
): Promise<void> {
  if (chapters.length === 0) return;

  // group chapters by bible
  const groups: BibleChapterGroup = new Map();
  for (const c of chapters) {
    const list = groups.get(c.bibleId) ?? [];
    list.push({ bookId: c.bookId, chapterNumber: c.chapterNumber });
    groups.set(c.bibleId, list);
  }

  return retrySyncStep(
    'Prepare offline bible text sync',
    KV_KEYS.SYNC_ERROR_PREPARE_OFFLINE_BIBLE_TEXTS,
    async () => {
      for (const [bibleId, list] of groups) {
        for (let i = 0; i < list.length; i += BIBLE_TEXT_CHUNK_SIZE) {
          const chunk = list.slice(i, i + BIBLE_TEXT_CHUNK_SIZE);
          const response = await FluentAPI.getBibleTexts(bibleId, chunk);
          const books: ApiBook[] = response.data;
          if (!Array.isArray(books)) {
            throw new Error(`Invalid bible text response for bible ${bibleId}`);
          }

          await insertBibleTexts(
            books.map((book: ApiBook) => ({
              bibleId,
              bookId: book.bookId,
              chapterNumber: book.chapterNumber,
              verses: book.verses.map((verse: ApiVerse) =>
                mapBibleTextRow(
                  bibleId,
                  book.bookId,
                  book.chapterNumber,
                  verse,
                ),
              ),
            })),
          );
        }
      }
    },
  );
}
