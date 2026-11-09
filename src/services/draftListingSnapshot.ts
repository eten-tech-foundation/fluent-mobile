import type { VerseAudioListResponse } from '../types/api/verseAudio';

/**
 * Per-chapter draft-audio listing snapshot (#886).
 *
 * `GET /verse-audio` for a chapter returns every unit with its active take
 * and a short-lived signed URL. Without the snapshot the download worker
 * re-fetches the whole chapter listing once per queued file (N+1). The
 * snapshot lets the manifest listing (and the first worker refresh) serve the
 * chapter's other items, with these freshness rules:
 *
 * - Key: `(userId, projectUnitId, bibleId, bookId, chapterNumber)`. A read
 *   for a different user, or while a different account is active, misses.
 * - TTL: `DRAFT_LISTING_SNAPSHOT_TTL_MS` from the network fetch. Well under
 *   the signed-URL lifetime (#508 SAS, 15 min) so a URL served from the
 *   snapshot is never older than the TTL.
 * - Revalidation: the resolver still checks `activeTakeId` + `contentHash`
 *   per item. A mismatch against a snapshot triggers exactly one network
 *   listing for that item (bounded revalidation), never a listing per file.
 * - Accepted staleness: an active-take change on the server after the
 *   snapshot is detected at the next network listing (TTL expiry, mismatch,
 *   or a new manifest build), not earlier. The bytes downloaded in that
 *   window are still the take the item was queued for (download validation checks object
 *   identity and size), so this is a freshness window, not a wrong-object
 *   risk.
 *
 * In-memory only: a cold start always re-lists.
 */
export const DRAFT_LISTING_SNAPSHOT_TTL_MS = 60_000;
/** Upper bound on retained chapters; oldest entries are evicted first. */
export const DRAFT_LISTING_SNAPSHOT_MAX_ENTRIES = 32;

export type DraftListingChapterKey = {
  projectUnitId: number;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
};

interface DraftListingSnapshot {
  userId: string;
  list: VerseAudioListResponse;
  fetchedAt: number;
}

const snapshots = new Map<string, DraftListingSnapshot>();

function keyOf(chapter: DraftListingChapterKey, userId: string): string {
  return `${userId}:${chapter.projectUnitId}:${chapter.bibleId}:${chapter.bookId}:${chapter.chapterNumber}`;
}

/**
 * Store a listing fetched from the network for `userId`. `now` should be the
 * time the listing response arrived, not when the caller got around to
 * seeding. Expired entries are swept and the map is capped so chapters that
 * are never read again cannot accumulate.
 */
export function seedDraftListingSnapshot(
  chapter: DraftListingChapterKey,
  userId: string,
  list: VerseAudioListResponse,
  now: number = Date.now(),
): void {
  for (const [key, entry] of snapshots) {
    const ageMs = now - entry.fetchedAt;
    if (ageMs < 0 || ageMs >= DRAFT_LISTING_SNAPSHOT_TTL_MS) {
      snapshots.delete(key);
    }
  }
  const key = keyOf(chapter, userId);
  snapshots.delete(key);
  while (snapshots.size >= DRAFT_LISTING_SNAPSHOT_MAX_ENTRIES) {
    // Map iteration is insertion-ordered: the first key is the oldest seed.
    const oldest = snapshots.keys().next().value;
    if (oldest === undefined) break;
    snapshots.delete(oldest);
  }
  snapshots.set(key, { userId, list, fetchedAt: now });
}

/**
 * Return the chapter listing for `userId` if present and younger than the
 * TTL; expired entries are dropped on read. Callers must still gate on the
 * active account (the resolver does) — the key only isolates per user.
 */
export function readDraftListingSnapshot(
  chapter: DraftListingChapterKey,
  userId: string,
  now: number = Date.now(),
): { list: VerseAudioListResponse; ageMs: number } | null {
  const key = keyOf(chapter, userId);
  const entry = snapshots.get(key);
  if (!entry) return null;
  const ageMs = now - entry.fetchedAt;
  if (ageMs < 0 || ageMs >= DRAFT_LISTING_SNAPSHOT_TTL_MS) {
    snapshots.delete(key);
    return null;
  }
  return { list: entry.list, ageMs };
}

/** Drop one chapter's snapshot (resolver mismatch → bounded revalidation). */
export function invalidateDraftListingSnapshot(
  chapter: DraftListingChapterKey,
  userId: string,
): void {
  snapshots.delete(keyOf(chapter, userId));
}

/** Drop every snapshot (sign-out in `authSession.signOut`; tests). */
export function clearDraftListingSnapshots(): void {
  snapshots.clear();
}
