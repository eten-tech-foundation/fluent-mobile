import type { DownloadQueueItem } from '../types/download/types';
import { FluentAPI } from './api';
import {
  contentTypeToAudioExt,
  resolveActiveTakeDownload,
} from './draftAudioActiveTake';
import { isDraftAudioResourceId } from './draftDownloadIds';
import {
  invalidateDraftListingSnapshot,
  readDraftListingSnapshot,
  seedDraftListingSnapshot,
} from './draftListingSnapshot';
import type { ResourceResolver } from './downloadQueueWorker';
import { getCredentials } from './keychain';
import { getActiveUserId } from './storage';
import { logger } from '../utils/logger';
import type { VerseAudioListResponse } from '../types/api/verseAudio';

const log = logger.create('DownloadResourceResolver');

export type DraftAudioRefreshMeta = {
  projectUnitId: number;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  bibleTextId: number;
  expectedActiveTakeId: number;
  expectedContentHash: string;
};

/**
 * Refresh a draft-audio queue item's download URL from GET /verse-audio.
 * Verifies exact activeTakeId + contentHash before returning a URL so a take
 * change cannot resume into the wrong object.
 */
async function resolveDraftAudioItem(
  item: DownloadQueueItem,
  signal?: AbortSignal,
  forceRefresh = false,
): Promise<{ url: string; ext: string }> {
  let meta: DraftAudioRefreshMeta;
  try {
    meta = JSON.parse(item.serializedContent ?? '') as DraftAudioRefreshMeta;
  } catch {
    throw new Error(
      `Draft audio item ${item.id} missing refresh metadata in serializedContent`,
    );
  }

  if (
    !Number.isFinite(meta.projectUnitId) ||
    !Number.isFinite(meta.bibleId) ||
    !Number.isFinite(meta.bookId) ||
    !Number.isFinite(meta.chapterNumber) ||
    !Number.isFinite(meta.bibleTextId) ||
    !Number.isFinite(meta.expectedActiveTakeId) ||
    typeof meta.expectedContentHash !== 'string' ||
    meta.expectedContentHash.length === 0
  ) {
    throw new Error(`Draft audio item ${item.id} has invalid refresh metadata`);
  }

  if (item.userId !== undefined && getActiveUserId() !== String(item.userId)) {
    throw new Error(
      `Draft audio refresh aborted: active account != item userId ${item.userId}`,
    );
  }

  let sessionToken: string | undefined;
  if (item.userId !== undefined) {
    const creds = await getCredentials(String(item.userId));
    if (getActiveUserId() !== String(item.userId)) {
      throw new Error(
        `Draft audio refresh aborted: account changed before list request`,
      );
    }
    sessionToken = creds?.token;
    if (!sessionToken) {
      throw new Error(
        `Draft audio refresh aborted: no in-memory session for userId ${item.userId}`,
      );
    }
  }

  const chapter = {
    projectUnitId: meta.projectUnitId,
    bibleId: meta.bibleId,
    bookId: meta.bookId,
    chapterNumber: meta.chapterNumber,
  };
  // Snapshot is keyed per user; items without a userId never use it.
  const snapshotUserId = item.userId !== undefined ? String(item.userId) : null;

  const fetchListing = async (): Promise<VerseAudioListResponse> => {
    const fetched = await FluentAPI.getChapterVerseAudio(
      chapter,
      sessionToken,
      // Worker pause/cancel aborts the listing request instead of letting it
      // run to the transport timeout (#886).
      signal ? { signal } : undefined,
    );
    if (
      item.userId !== undefined &&
      getActiveUserId() !== String(item.userId)
    ) {
      throw new Error(
        `Draft audio refresh aborted: account changed after list response`,
      );
    }
    if (snapshotUserId !== null) {
      seedDraftListingSnapshot(chapter, snapshotUserId, fetched);
    }
    return fetched;
  };

  // One chapter listing serves the chapter's queued files while it is fresh
  // (#886); see draftListingSnapshot.ts for the freshness rules.
  if (forceRefresh && snapshotUserId !== null) {
    invalidateDraftListingSnapshot(chapter, snapshotUserId);
  }
  const cached =
    snapshotUserId !== null
      ? readDraftListingSnapshot(chapter, snapshotUserId)
      : null;
  let list: VerseAudioListResponse;
  let fromSnapshot: boolean;
  if (cached) {
    list = cached.list;
    fromSnapshot = true;
  } else {
    list = await fetchListing();
    fromSnapshot = false;
  }

  const matchExpected = (
    candidate: VerseAudioListResponse,
  ): ReturnType<typeof resolveActiveTakeDownload> | string => {
    const unit = candidate.items.find(
      entry => entry.bibleTextId === meta.bibleTextId,
    );
    if (!unit) {
      return `Draft audio refresh: bibleTextId ${meta.bibleTextId} not in chapter listing`;
    }
    let resolved: ReturnType<typeof resolveActiveTakeDownload>;
    try {
      resolved = resolveActiveTakeDownload(unit);
    } catch (error) {
      // No resolvable active take (null activeTakeId, missing take or URL):
      // a stale snapshot in this state must still get its one revalidation.
      return `Draft audio refresh: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
    if (resolved.take.id !== meta.expectedActiveTakeId) {
      return `Draft audio refresh: activeTakeId ${resolved.take.id} != expected ${meta.expectedActiveTakeId}`;
    }
    if (resolved.take.contentHash !== meta.expectedContentHash) {
      return `Draft audio refresh: contentHash mismatch for take ${resolved.take.id}`;
    }
    return resolved;
  };

  let outcome = matchExpected(list);
  if (typeof outcome === 'string' && fromSnapshot && snapshotUserId !== null) {
    // Bounded revalidation: a snapshot that disagrees with the item gets one
    // fresh listing before the item is failed — never a listing per file.
    invalidateDraftListingSnapshot(chapter, snapshotUserId);
    list = await fetchListing();
    outcome = matchExpected(list);
  }
  if (typeof outcome === 'string') {
    throw new Error(outcome);
  }
  const resolved = outcome;

  const ext = item.fileExt ?? contentTypeToAudioExt(resolved.take.contentType);

  log.info('Refreshed draft audio download URL', {
    resourceId: item.resourceId ?? item.id,
    bibleTextId: meta.bibleTextId,
    activeTakeId: meta.expectedActiveTakeId,
  });

  return { url: resolved.take.downloadUrl, ext };
}

export const queuedResourceResolver: ResourceResolver = async (
  item: DownloadQueueItem,
  options,
) => {
  const resourceId = item.resourceId ?? item.id;
  if (isDraftAudioResourceId(resourceId)) {
    return resolveDraftAudioItem(item, options?.signal, options?.forceRefresh);
  }

  if (item.sourceUrl && item.fileExt) {
    return { url: item.sourceUrl, ext: item.fileExt };
  }

  throw new Error(
    `No download source configured for item ${item.id}. ` +
      'Queue callers must provide sourceUrl/fileExt from the #51 resource manifest contract.',
  );
};
