import type { DownloadQueueItem } from '../types/download/types';
import { FluentAPI } from './api';
import {
  contentTypeToAudioExt,
  resolveActiveTakeDownload,
} from './draftAudioActiveTake';
import { isDraftAudioResourceId } from './draftDownloadIds';
import type { ResourceResolver } from './downloadQueueWorker';
import { getCredentials } from './keychain';
import { getActiveUserId } from './storage';
import { logger } from '../utils/logger';

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

  const list = await FluentAPI.getChapterVerseAudio(
    {
      projectUnitId: meta.projectUnitId,
      bibleId: meta.bibleId,
      bookId: meta.bookId,
      chapterNumber: meta.chapterNumber,
    },
    sessionToken,
  );

  if (item.userId !== undefined && getActiveUserId() !== String(item.userId)) {
    throw new Error(
      `Draft audio refresh aborted: account changed after list response`,
    );
  }

  const unit = list.items.find(entry => entry.bibleTextId === meta.bibleTextId);
  if (!unit) {
    throw new Error(
      `Draft audio refresh: bibleTextId ${meta.bibleTextId} not in chapter listing`,
    );
  }

  const resolved = resolveActiveTakeDownload(unit);
  if (resolved.take.id !== meta.expectedActiveTakeId) {
    throw new Error(
      `Draft audio refresh: activeTakeId ${resolved.take.id} != expected ${meta.expectedActiveTakeId}`,
    );
  }
  if (resolved.take.contentHash !== meta.expectedContentHash) {
    throw new Error(
      `Draft audio refresh: contentHash mismatch for take ${resolved.take.id}`,
    );
  }

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
) => {
  const resourceId = item.resourceId ?? item.id;
  if (isDraftAudioResourceId(resourceId)) {
    return resolveDraftAudioItem(item);
  }

  if (item.sourceUrl && item.fileExt) {
    return { url: item.sourceUrl, ext: item.fileExt };
  }

  throw new Error(
    `No download source configured for item ${item.id}. ` +
      'Queue callers must provide sourceUrl/fileExt from the #51 resource manifest contract.',
  );
};
