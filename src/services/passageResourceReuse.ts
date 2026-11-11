import { isApiError } from '../types/api/errors';

/**
 * Reuse of a passage's remote resources (translation notes per verse, the
 * chapter's source-audio lookup) across a quick close and reopen (#886).
 *
 * Without it every open of a passage refetches each verse's notes and the
 * source-audio lookup, and a reopen during the first open's fetch starts the
 * same requests again. Rules:
 *
 * - Key: the caller's resource key plus `userId`. Another account misses, and
 *   joins none of this account's requests.
 * - Successful results are reused, empty ones included. A server error
 *   (5xx) is held for `PASSAGE_RESOURCE_FAILURE_HOLD_MS` and rethrown as the
 *   same failure, so a quick reopen doesn't fan the same failing requests out
 *   again; it is never reused as data. Other failures (network, 4xx) are
 *   dropped, so the next open asks again.
 * - TTL: `PASSAGE_RESOURCE_REUSE_TTL_MS` from the response; `isValid` can
 *   retire an entry sooner (e.g. an expired signed URL).
 * - `fresh` (explicit retry) skips a stored result, a held failure and a
 *   request in flight, and its result replaces them.
 * - Cleared on sign-out and when an account's grants change. Display only:
 *   never a stand-in for authorization.
 *
 * In-memory only: a cold start always refetches.
 */
export const PASSAGE_RESOURCE_REUSE_TTL_MS = 5 * 60_000;
export const PASSAGE_RESOURCE_FAILURE_HOLD_MS = 30_000;
/** Upper bound on retained results; oldest entries are evicted first. */
export const PASSAGE_RESOURCE_REUSE_MAX_ENTRIES = 256;

interface Entry {
  userId: string;
  generation: number;
  value?: unknown;
  fetchedAt?: number;
  failure?: { error: unknown; at: number };
  inFlight?: Promise<unknown>;
}

const entries = new Map<string, Entry>();
let generation = 0;
const userGenerations = new Map<string, number>();
const clearListeners = new Set<() => void>();

/** Called after every clear, so mounted callers can drop what they show. */
export function subscribePassageResourceClears(
  listener: () => void,
): () => void {
  clearListeners.add(listener);
  return () => {
    clearListeners.delete(listener);
  };
}

/**
 * Changes whenever `userId`'s results are cleared. A caller holding its own
 * copy of a result stores this beside it and drops the copy once it differs,
 * so a clear reaches it too.
 */
export function passageResourceEpoch(userId: string): string {
  return `${generation}:${userGenerations.get(userId) ?? 0}`;
}

export async function reusePassageResource<T>(
  userId: string,
  key: string,
  fetch: () => Promise<T>,
  options: { fresh?: boolean; isValid?: (value: T) => boolean } = {},
): Promise<T> {
  const fullKey = `${userId}:${key}`;
  const now = Date.now();
  const entry = entries.get(fullKey);
  if (entry && !options.fresh) {
    if (entry.fetchedAt !== undefined) {
      const ageMs = now - entry.fetchedAt;
      const value = entry.value as T;
      if (
        ageMs >= 0 &&
        ageMs < PASSAGE_RESOURCE_REUSE_TTL_MS &&
        (options.isValid?.(value) ?? true)
      ) {
        return value;
      }
    } else if (entry.failure) {
      const ageMs = now - entry.failure.at;
      if (ageMs >= 0 && ageMs < PASSAGE_RESOURCE_FAILURE_HOLD_MS) {
        throw entry.failure.error;
      }
    } else if (entry.inFlight) {
      return entry.inFlight as Promise<T>;
    }
  }

  const mine: Entry = { userId, generation };
  const request = fetch();
  mine.inFlight = request;
  entries.delete(fullKey);
  entries.set(fullKey, mine);
  try {
    const value = await request;
    // A clear or a newer request since this one started owns the slot now.
    if (entries.get(fullKey) === mine && mine.generation === generation) {
      mine.value = value;
      mine.fetchedAt = Date.now();
      mine.inFlight = undefined;
      evict(mine.fetchedAt);
    }
    return value;
  } catch (error) {
    if (entries.get(fullKey) === mine) {
      if (isApiError(error) && error.status >= 500) {
        mine.failure = { error, at: Date.now() };
        mine.inFlight = undefined;
        evict(mine.failure.at);
      } else {
        entries.delete(fullKey);
      }
    }
    throw error;
  }
}

function evict(now: number): void {
  for (const [key, entry] of entries) {
    if (
      (entry.fetchedAt !== undefined &&
        now - entry.fetchedAt >= PASSAGE_RESOURCE_REUSE_TTL_MS) ||
      (entry.failure &&
        now - entry.failure.at >= PASSAGE_RESOURCE_FAILURE_HOLD_MS)
    ) {
      entries.delete(key);
    }
  }
  while (entries.size > PASSAGE_RESOURCE_REUSE_MAX_ENTRIES) {
    // Map iteration is insertion-ordered: the first key is the oldest.
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/**
 * Drop one account's results (grants changed), or everything (sign-out,
 * tests). Requests already in flight still resolve for their callers but
 * aren't kept; subscribers are told so they stop showing them.
 */
export function clearPassageResourceReuse(userId?: string): void {
  if (userId === undefined) {
    generation += 1;
    entries.clear();
  } else {
    userGenerations.set(userId, (userGenerations.get(userId) ?? 0) + 1);
    for (const [key, entry] of entries) {
      if (entry.userId === userId) entries.delete(key);
    }
  }
  clearListeners.forEach(listener => listener());
}
