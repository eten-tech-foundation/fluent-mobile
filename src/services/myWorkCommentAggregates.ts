import {
  parseChapterCommentAggregate,
  type ChapterCommentAggregate,
} from '../types/api/chapterCommentAggregate';
import { pMapLimit } from '../utils/concurrency';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import { isAuthError } from './authError';
import { getCredentials } from './keychain';
import { emitAuthReauthRequired } from './syncEvents';
import {
  getActiveUserId,
  getKnownUserIds,
  isReauthRequired,
  kvStorage,
  setReauthRequired,
} from './storage';

const log = logger.create('MyWorkCommentAggregates');

/** Small bound so My Work list publish is not blocked on N serial GETs. */
const AGGREGATE_FETCH_CONCURRENCY = 4;

export type KnownCommentAggregateCacheEntry = {
  status: 'known';
  commentCount: number;
  currentUserHasCommented: boolean;
};

export type CommentAggregateCacheEntry =
  | KnownCommentAggregateCacheEntry
  | { status: 'unknown' };

type StoredAggregateMap = Record<string, CommentAggregateCacheEntry>;

type InFlightAggregateFetch = {
  sessionToken: string;
  requestGen: number;
  promise: Promise<void>;
};

const aggregateSnapshotKey = (userId: string) =>
  `${userId}:my_work_comment_aggregates`;

/**
 * Per-user invalidation generation. Bumped only on logout clear / explicit
 * invalidate — not on every refresh wave — so identical concurrent refreshes
 * share in-flight GETs instead of invalidating each other.
 */
const refreshGenerationByUser = new Map<string, number>();

/**
 * In-flight GET dedupe keyed by userId:chapterAssignmentId.
 * Join only when sessionToken + requestGen match (same identity).
 */
const inFlightByAssignment = new Map<string, InFlightAggregateFetch>();

function currentRefreshGeneration(userId: string): number {
  return refreshGenerationByUser.get(userId) ?? 0;
}

function bumpRefreshGeneration(userId: string): number {
  const next = currentRefreshGeneration(userId) + 1;
  refreshGenerationByUser.set(userId, next);
  return next;
}

function inFlightKey(userId: string, chapterAssignmentId: number): string {
  return `${userId}:${chapterAssignmentId}`;
}

function clearInFlightForUser(userId: string): void {
  for (const key of inFlightByAssignment.keys()) {
    if (key.startsWith(`${userId}:`)) {
      inFlightByAssignment.delete(key);
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRegisteredDeviceAccount(userId: string): boolean {
  return Boolean(userId) && getKnownUserIds().includes(userId);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function assignmentKey(chapterAssignmentId: number): string {
  return String(chapterAssignmentId);
}

function readStoredMap(userId: string): StoredAggregateMap {
  const raw = kvStorage.getItemSync(aggregateSnapshotKey(userId));
  if (raw === null || raw === undefined || raw === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const out: StoredAggregateMap = {};
    for (const [key, entry] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!/^\d+$/.test(key) || Number(key) <= 0) {
        continue;
      }
      const normalized = normalizeStoredEntry(entry);
      if (normalized) {
        out[key] = normalized;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function normalizeStoredEntry(
  value: unknown,
): CommentAggregateCacheEntry | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.status === 'unknown') {
    return { status: 'unknown' };
  }
  if (raw.status !== 'known') {
    return null;
  }
  if (
    typeof raw.commentCount !== 'number' ||
    !Number.isInteger(raw.commentCount) ||
    raw.commentCount < 0
  ) {
    return null;
  }
  if (typeof raw.currentUserHasCommented !== 'boolean') {
    return null;
  }
  return {
    status: 'known',
    commentCount: raw.commentCount,
    currentUserHasCommented: raw.currentUserHasCommented,
  };
}

function writeStoredMap(userId: string, map: StoredAggregateMap): void {
  if (!userId) return;
  kvStorage.setItemSync(aggregateSnapshotKey(userId), JSON.stringify(map));
}

function writeEntry(
  userId: string,
  chapterAssignmentId: number,
  entry: CommentAggregateCacheEntry,
): void {
  if (!userId || !isPositiveInt(chapterAssignmentId)) return;
  const map = readStoredMap(userId);
  map[assignmentKey(chapterAssignmentId)] = entry;
  writeStoredMap(userId, map);
}

/**
 * Fail-closed read for My Work consumers.
 * Unregistered / reauth-required accounts never surface known aggregates.
 */
export function getCommentAggregateCacheEntry(
  userId: string,
  chapterAssignmentId: number,
): CommentAggregateCacheEntry {
  if (!userId || !isRegisteredDeviceAccount(userId)) {
    return { status: 'unknown' };
  }
  if (isReauthRequired(userId)) {
    return { status: 'unknown' };
  }
  if (!isPositiveInt(chapterAssignmentId)) {
    return { status: 'unknown' };
  }
  return (
    readStoredMap(userId)[assignmentKey(chapterAssignmentId)] ?? {
      status: 'unknown',
    }
  );
}

/** Persist a schema-valid aggregate for one account + assignment. */
export function persistCommentAggregate(
  userId: string,
  aggregate: ChapterCommentAggregate,
): void {
  if (!userId || !isRegisteredDeviceAccount(userId)) {
    return;
  }
  const parsed = parseChapterCommentAggregate(
    aggregate,
    aggregate.chapterAssignmentId,
  );
  if (!parsed) {
    return;
  }
  writeEntry(userId, parsed.chapterAssignmentId, {
    status: 'known',
    commentCount: parsed.commentCount,
    currentUserHasCommented: parsed.currentUserHasCommented,
  });
}

export function markCommentAggregateUnknown(
  userId: string,
  chapterAssignmentId: number,
): void {
  if (!userId || !isPositiveInt(chapterAssignmentId)) return;
  writeEntry(userId, chapterAssignmentId, { status: 'unknown' });
}

/**
 * Remove stored aggregates for one account (sign-out) and invalidate in-flight
 * refresh for that user only — never a global wipe.
 */
export function clearMyWorkCommentAggregates(userId: string): void {
  if (!userId) return;
  bumpRefreshGeneration(userId);
  clearInFlightForUser(userId);
  kvStorage.removeItemSync(aggregateSnapshotKey(userId));
}

/** Invalidate in-flight refresh generation for one account (future #451 helper). */
export function invalidateMyWorkCommentAggregateRefresh(userId: string): void {
  if (!userId) return;
  bumpRefreshGeneration(userId);
  clearInFlightForUser(userId);
}

function noteAuthFailure(userId: string): void {
  setReauthRequired(userId);
  if (userId === getActiveUserId()) {
    emitAuthReauthRequired(userId);
  }
}

/**
 * Completion is current only while the same account remains the active viewer,
 * remains registered, not reauth-required, generation not invalidated, and the
 * captured session token still matches keychain.
 */
async function isRefreshCompletionCurrent(
  userId: string,
  requestGen: number,
  sessionToken: string,
): Promise<boolean> {
  if (currentRefreshGeneration(userId) !== requestGen) {
    return false;
  }
  if (getActiveUserId() !== userId) {
    return false;
  }
  if (!isRegisteredDeviceAccount(userId)) {
    return false;
  }
  if (isReauthRequired(userId)) {
    return false;
  }
  const creds = await getCredentials(userId);
  if (currentRefreshGeneration(userId) !== requestGen) {
    return false;
  }
  if (getActiveUserId() !== userId) {
    return false;
  }
  return creds?.token === sessionToken;
}

async function fetchAndStoreOne(
  userId: string,
  chapterAssignmentId: number,
  sessionToken: string,
  requestGen: number,
): Promise<void> {
  const key = inFlightKey(userId, chapterAssignmentId);
  const existing = inFlightByAssignment.get(key);
  // Identical concurrent identity (account + token + gen + assignment) shares
  // one GET. Token change / invalidation must not join a stale in-flight.
  if (
    existing &&
    existing.sessionToken === sessionToken &&
    existing.requestGen === requestGen
  ) {
    await existing.promise;
    return;
  }

  const run = (async () => {
    if (!(await isRefreshCompletionCurrent(userId, requestGen, sessionToken))) {
      return;
    }
    try {
      const aggregate = await FluentAPI.getCommentAggregate(
        chapterAssignmentId,
        sessionToken,
      );
      if (
        !(await isRefreshCompletionCurrent(userId, requestGen, sessionToken))
      ) {
        return;
      }
      const parsed = parseChapterCommentAggregate(
        aggregate,
        chapterAssignmentId,
      );
      if (!parsed) {
        markCommentAggregateUnknown(userId, chapterAssignmentId);
        return;
      }
      persistCommentAggregate(userId, parsed);
    } catch (error) {
      if (
        !(await isRefreshCompletionCurrent(userId, requestGen, sessionToken))
      ) {
        log.info(
          'Comment aggregate error discarded; completion no longer current',
          {
            userId,
            chapterAssignmentId,
            error: getErrorMessage(error),
          },
        );
        return;
      }
      if (isAuthError(error)) {
        noteAuthFailure(userId);
        return;
      }
      markCommentAggregateUnknown(userId, chapterAssignmentId);
      log.warn('Comment aggregate fetch failed; marking unknown', {
        userId,
        chapterAssignmentId,
        error: getErrorMessage(error),
      });
    }
  })();

  inFlightByAssignment.set(key, { sessionToken, requestGen, promise: run });
  try {
    await run;
  } finally {
    const current = inFlightByAssignment.get(key);
    if (current?.promise === run) {
      inFlightByAssignment.delete(key);
    }
  }
}

/**
 * Background refresh of comment aggregates for My Work rows.
 * Uses the captured account token only; never invents 0/false on errors.
 * Dedupes concurrent identical account/token/assignment GETs. Safe for #451.
 */
export async function refreshMyWorkCommentAggregates(options: {
  userId: string;
  sessionToken: string;
  chapterAssignmentIds: readonly number[];
}): Promise<void> {
  const { userId, sessionToken, chapterAssignmentIds } = options;
  if (!userId || !sessionToken) return;
  if (!isRegisteredDeviceAccount(userId)) {
    log.warn('Comment aggregate refresh skipped; account not registered', {
      userId,
    });
    return;
  }
  if (isReauthRequired(userId)) {
    return;
  }

  const ids = [
    ...new Set(
      chapterAssignmentIds.filter((id): id is number => isPositiveInt(id)),
    ),
  ];
  if (ids.length === 0) return;

  // Capture generation at wave start — do not bump. Logout / explicit
  // invalidate bumps; a later bump makes this wave's completions no-ops.
  const requestGen = currentRefreshGeneration(userId);
  await pMapLimit(ids, AGGREGATE_FETCH_CONCURRENCY, async id => {
    await fetchAndStoreOne(userId, id, sessionToken, requestGen);
  });
}
