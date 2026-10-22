import * as FileSystem from 'expo-file-system/legacy';
import {
  deleteDownloadItem,
  enqueueDownloadItems,
  getDownloadQueueItemsByResourcePrefix,
  requeueDownloadItems,
  type EnqueueDownloadItemInput,
} from '../db/downloadQueueRepository';
import type { DownloadQueueItem } from '../types/download/types';
import type {
  DraftChapterLocalBundle,
  DraftDownloadRequest,
  DraftDownloadState,
  DraftDownloadStatus,
  DraftDownloadUnitAnchor,
  DraftSourceScriptureSnapshot,
} from '../types/draftDownload/types';
import type { TranslatedVerseResponse } from '../types/api/translatedVerse';
import type { ApiVerse } from '../types/api/types';
import { FluentAPI } from './api';
import {
  contentTypeToAudioExt,
  resolveActiveTakeDownload,
} from './draftAudioActiveTake';
import {
  DRAFT_DOWNLOAD_RESOURCE_NAME,
  draftAudioResourceId,
  draftScriptureResourceId,
  draftSessionKey,
  draftTextResourceId,
  isDraftChapterResourceId,
} from './draftDownloadIds';
import {
  readDraftDownloadManifest,
  writeDraftDownloadManifest,
  type DraftDownloadManifest,
  type DraftManifestIdentity,
} from './draftDownloadManifest';
import type { DraftAudioRefreshMeta } from './downloadResourceResolver';
import { getSharedDownloadQueueWorker } from './downloadQueueWorkerSingleton';
import { deleteDownloadResourceFile, fileExists } from './downloadStorage';
import { getTransferTransportSnapshot } from './connectivity';
import { getCredentials } from './keychain';
import { getActiveUserId } from './storage';
import { getUploadOverCellular } from './userPreferences';
import { onDownloadQueueChanged } from '../utils/downloadQueueEvents';
import { logger } from '../utils/logger';
import {
  transferInputFromLinkSnapshot,
  transportAllowsTransfer,
} from '../utils/transportPolicy';
import {
  DRAFT_DOWNLOAD_READY_FADE_MS,
  DRAFT_DOWNLOAD_READY_HOLD_MS,
} from './draftDownloadTiming';

const log = logger.create('DraftDownload');

/**
 * Capture the request account's bearer in memory for this call only.
 * Never persists or copies credentials into draft manifests/queue rows.
 * Fail closed when the active account does not match `requestUserId`.
 */
async function captureSessionTokenForRequest(
  requestUserId: number,
): Promise<string | null> {
  if (getActiveUserId() !== String(requestUserId)) {
    return null;
  }
  const creds = await getCredentials(String(requestUserId));
  if (getActiveUserId() !== String(requestUserId)) {
    return null;
  }
  return creds?.token ?? null;
}

function isActiveRequestAccount(requestUserId: number): boolean {
  return getActiveUserId() === String(requestUserId);
}

export {
  DRAFT_DOWNLOAD_READY_FADE_MS,
  DRAFT_DOWNLOAD_READY_HOLD_MS,
} from './draftDownloadTiming';

const readyAtBySession = new Map<string, number>();
const scriptureWatchers = new Set<string>();
const scriptureWatcherUnsubs = new Map<string, () => void>();

function identityOf(
  request: Pick<
    DraftDownloadRequest,
    'projectId' | 'userId' | 'chapterAssignmentId' | 'role'
  >,
): DraftManifestIdentity {
  return {
    projectId: request.projectId,
    userId: request.userId,
    chapterAssignmentId: request.chapterAssignmentId,
    role: request.role,
  };
}

function sessionKeyOf(
  request: Pick<
    DraftDownloadRequest,
    'projectId' | 'userId' | 'chapterAssignmentId' | 'role'
  >,
): string {
  return draftSessionKey(request);
}

function audioRefreshMeta(
  request: DraftDownloadRequest,
  bibleTextId: number,
  activeTakeId: number,
  contentHash: string,
): string {
  const meta: DraftAudioRefreshMeta = {
    projectUnitId: request.projectUnitId,
    bibleId: request.bibleId,
    bookId: request.bookId,
    chapterNumber: request.chapterNumber,
    bibleTextId,
    expectedActiveTakeId: activeTakeId,
    expectedContentHash: contentHash,
  };
  return JSON.stringify(meta);
}

async function loadChapterItems(
  request: Pick<
    DraftDownloadRequest,
    'projectId' | 'userId' | 'chapterAssignmentId'
  >,
): Promise<DownloadQueueItem[]> {
  const rows = await getDownloadQueueItemsByResourcePrefix(
    request.projectId,
    request.userId,
    'draft-',
  );
  return rows.filter(item =>
    isDraftChapterResourceId(
      item.resourceId ?? item.id,
      request.chapterAssignmentId,
    ),
  );
}

/** Keep only rows that match the current manifest's expected resource ids. */
function expectedItems(
  items: DownloadQueueItem[],
  manifest: DraftDownloadManifest | null,
  role: DraftDownloadRequest['role'],
): DownloadQueueItem[] {
  if (!manifest || manifest.purged) return [];
  const expected = new Set<string>([
    ...manifest.units.map(unit => unit.resourceId),
    draftTextResourceId(manifest.chapterAssignmentId),
  ]);
  if (role === 'observer') {
    expected.add(draftScriptureResourceId(manifest.chapterAssignmentId));
  }
  return items.filter(item => expected.has(item.resourceId ?? item.id));
}

function aggregateProgress(
  items: DownloadQueueItem[],
  expected: number,
): number {
  if (expected <= 0) return 0;
  let sum = 0;
  for (const item of items) {
    if (item.status === 'completed') sum += 1;
    else sum += Math.max(0, Math.min(1, item.progress));
  }
  return Math.min(1, sum / expected);
}

function expectedCount(
  manifest: DraftDownloadManifest | null,
  role: DraftDownloadRequest['role'],
): number {
  if (!manifest || manifest.purged) return 0;
  const audioAndText = manifest.units.length + 1;
  return role === 'observer' ? audioAndText + 1 : audioAndText;
}

function scriptureItemCompleted(
  items: DownloadQueueItem[],
  chapterAssignmentId: number,
): boolean {
  const scripture = items.find(
    item =>
      (item.resourceId ?? item.id) ===
      draftScriptureResourceId(chapterAssignmentId),
  );
  return (
    scripture?.status === 'completed' &&
    typeof scripture.localFilePath === 'string' &&
    scripture.localFilePath.length > 0
  );
}

function deriveStatus(
  items: DownloadQueueItem[],
  manifest: DraftDownloadManifest | null,
  role: DraftDownloadRequest['role'],
): DraftDownloadStatus {
  if (!manifest || manifest.purged) return 'idle';
  if (items.some(item => item.status === 'failed')) return 'failed';
  if (role === 'observer' && manifest.sourceScriptureError) return 'failed';

  const expectedAudioIds = new Set(manifest.units.map(u => u.resourceId));
  const textId = draftTextResourceId(manifest.chapterAssignmentId);
  const scriptureId = draftScriptureResourceId(manifest.chapterAssignmentId);

  const byResource = new Map(
    items.map(item => [item.resourceId ?? item.id, item]),
  );

  for (const resourceId of expectedAudioIds) {
    const row = byResource.get(resourceId);
    if (!row || row.status !== 'completed') {
      if (items.some(item => item.status === 'downloading'))
        return 'downloading';
      if (
        items.some(item => item.status === 'queued' || item.status === 'paused')
      ) {
        return 'queued';
      }
      return items.length === 0 ? 'idle' : 'downloading';
    }
  }

  const textRow = byResource.get(textId);
  if (!textRow || textRow.status !== 'completed') {
    if (items.some(item => item.status === 'downloading')) return 'downloading';
    return 'queued';
  }

  if (role === 'observer') {
    const scriptureRow = byResource.get(scriptureId);
    if (!scriptureRow) return 'downloading';
    if (scriptureRow.status === 'failed') return 'failed';
    if (scriptureRow.status !== 'completed' || !scriptureRow.localFilePath) {
      return scriptureRow.status === 'downloading' ? 'downloading' : 'queued';
    }
  }

  return 'ready';
}

function derivePhase(
  items: DownloadQueueItem[],
  role: DraftDownloadRequest['role'],
  status: DraftDownloadStatus,
  chapterAssignmentId: number,
): DraftDownloadState['phase'] {
  if (status === 'idle' && items.length === 0) return 'idle';
  if (status === 'ready') return 'complete';

  const audioDone = items
    .filter(item => item.kind === 'audio')
    .every(item => item.status === 'completed');
  if (!audioDone) return 'audio';

  const textDone = items
    .filter(
      item =>
        (item.resourceId ?? item.id) ===
        draftTextResourceId(chapterAssignmentId),
    )
    .every(item => item.status === 'completed');
  if (!textDone) return 'draft_text';

  if (
    role === 'observer' &&
    !scriptureItemCompleted(items, chapterAssignmentId)
  ) {
    return 'source_scripture';
  }
  return 'complete';
}

async function readLocalJsonFile<T>(
  path: string | undefined,
): Promise<T | null> {
  if (!path || !(await fileExists(path))) return null;
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function audioAndTextComplete(
  request: DraftDownloadRequest,
  manifest: DraftDownloadManifest,
): Promise<boolean> {
  const items = expectedItems(
    await loadChapterItems(request),
    manifest,
    'peer_check',
  );
  const byResource = new Map(
    items.map(item => [item.resourceId ?? item.id, item]),
  );
  for (const unit of manifest.units) {
    if (byResource.get(unit.resourceId)?.status !== 'completed') return false;
  }
  const text = byResource.get(
    draftTextResourceId(manifest.chapterAssignmentId),
  );
  return text?.status === 'completed';
}

async function enqueueObserverScriptureSnapshot(
  request: DraftDownloadRequest,
  manifest: DraftDownloadManifest,
  generation: number,
): Promise<void> {
  // Re-validate identity + tombstone before any write.
  const latest = await readDraftDownloadManifest(identityOf(request));
  if (
    !latest ||
    latest.purged ||
    latest.purgeGeneration !== generation ||
    latest.userId !== request.userId ||
    latest.projectId !== request.projectId ||
    latest.chapterAssignmentId !== request.chapterAssignmentId ||
    latest.role !== request.role
  ) {
    log.info('Skipping scripture snapshot; manifest identity/purge changed', {
      chapterAssignmentId: request.chapterAssignmentId,
      userId: request.userId,
    });
    return;
  }

  if (!(await audioAndTextComplete(request, latest))) return;

  if (!isActiveRequestAccount(request.userId)) {
    log.info('Skipping scripture snapshot; active account changed', {
      chapterAssignmentId: request.chapterAssignmentId,
      userId: request.userId,
      activeUserId: getActiveUserId(),
    });
    return;
  }

  const existing = (await loadChapterItems(request)).find(
    item =>
      (item.resourceId ?? item.id) ===
      draftScriptureResourceId(request.chapterAssignmentId),
  );
  if (existing?.status === 'completed' && existing.localFilePath) {
    if (await fileExists(existing.localFilePath)) return;
  }

  const response = await FluentAPI.getBibleTexts(request.bibleId, [
    { bookId: request.bookId, chapterNumber: request.chapterNumber },
  ]);
  if (!isActiveRequestAccount(request.userId)) {
    log.info('Dropping scripture response; active account changed', {
      chapterAssignmentId: request.chapterAssignmentId,
      userId: request.userId,
      activeUserId: getActiveUserId(),
    });
    return;
  }
  const books = response.data;
  if (!Array.isArray(books) || books.length === 0) {
    throw new Error('Empty bible texts response for source scripture snapshot');
  }
  const chapter = books.find(
    book =>
      book.bookId === request.bookId &&
      book.chapterNumber === request.chapterNumber,
  );
  if (
    !chapter ||
    !Array.isArray(chapter.verses) ||
    chapter.verses.length === 0
  ) {
    throw new Error('Source scripture chapter missing verses');
  }

  const snapshot: DraftSourceScriptureSnapshot = {
    bibleId: request.bibleId,
    bookId: request.bookId,
    chapterNumber: request.chapterNumber,
    verses: chapter.verses.map((verse: ApiVerse) => ({
      id: verse.id,
      verseNumber: verse.verseNumber,
      text: verse.text,
    })),
    localFilePath: '',
  };

  // Final tombstone + account check after network I/O.
  const postFetch = await readDraftDownloadManifest(identityOf(request));
  if (
    !postFetch ||
    postFetch.purged ||
    postFetch.purgeGeneration !== generation ||
    !isActiveRequestAccount(request.userId)
  ) {
    return;
  }

  const inputs: EnqueueDownloadItemInput[] = [
    {
      id: draftScriptureResourceId(request.chapterAssignmentId),
      projectId: request.projectId,
      userId: request.userId,
      tier: 1,
      kind: 'text',
      resourceName: DRAFT_DOWNLOAD_RESOURCE_NAME,
      label: 'Source scripture snapshot',
      fileExt: 'json',
      serializedContent: JSON.stringify({
        bibleId: snapshot.bibleId,
        bookId: snapshot.bookId,
        chapterNumber: snapshot.chapterNumber,
        verses: snapshot.verses,
      }),
      bookCode: request.bookCode,
      startChapter: request.chapterNumber,
      endChapter: request.chapterNumber,
    },
  ];

  if (
    existing &&
    (existing.status === 'failed' || existing.status === 'cancelled')
  ) {
    await requeueDownloadItems([existing.id]);
  }

  await enqueueDownloadItems(inputs);
  const afterEnqueue = await readDraftDownloadManifest(identityOf(request));
  if (afterEnqueue && afterEnqueue.sourceScriptureError) {
    await writeDraftDownloadManifest({
      ...afterEnqueue,
      sourceScriptureError: undefined,
    });
  }
  const scriptureRow = (await loadChapterItems(request)).find(
    item =>
      (item.resourceId ?? item.id) ===
      draftScriptureResourceId(request.chapterAssignmentId),
  );
  if (scriptureRow) {
    getSharedDownloadQueueWorker().enqueueAdditional([scriptureRow]);
  }
}

function stopObserverScriptureWatcher(key: string): void {
  scriptureWatchers.delete(key);
  const unsub = scriptureWatcherUnsubs.get(key);
  if (unsub) {
    unsub();
    scriptureWatcherUnsubs.delete(key);
  }
}

function watchObserverScripture(request: DraftDownloadRequest): void {
  if (request.role !== 'observer') return;
  const key = sessionKeyOf(request);
  if (scriptureWatchers.has(key)) return;
  scriptureWatchers.add(key);

  let generation = 0;
  let inFlight = false;
  let rerun = false;
  void readDraftDownloadManifest(identityOf(request)).then(m => {
    generation = m?.purgeGeneration ?? 0;
  });

  const run = () => {
    if (inFlight) {
      rerun = true;
      return;
    }
    inFlight = true;
    void (async () => {
      try {
        do {
          rerun = false;
          if (!isActiveRequestAccount(request.userId)) {
            continue;
          }
          const manifest = await readDraftDownloadManifest(identityOf(request));
          if (!manifest || manifest.purged || manifest.role !== 'observer') {
            stopObserverScriptureWatcher(key);
            return;
          }
          if (!isActiveRequestAccount(request.userId)) {
            continue;
          }
          generation = manifest.purgeGeneration;
          try {
            if (await audioAndTextComplete(request, manifest)) {
              if (!isActiveRequestAccount(request.userId)) {
                continue;
              }
              await enqueueObserverScriptureSnapshot(
                request,
                manifest,
                generation,
              );
              const cleared = await readDraftDownloadManifest(
                identityOf(request),
              );
              if (cleared && cleared.sourceScriptureError) {
                await writeDraftDownloadManifest({
                  ...cleared,
                  sourceScriptureError: undefined,
                });
              }
            }
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : 'Source scripture snapshot failed';
            log.error('Observer source scripture snapshot failed', {
              error,
              chapterAssignmentId: request.chapterAssignmentId,
              userId: request.userId,
            });
            const latest = await readDraftDownloadManifest(identityOf(request));
            if (
              latest &&
              !latest.purged &&
              latest.purgeGeneration === generation &&
              latest.userId === request.userId &&
              isActiveRequestAccount(request.userId)
            ) {
              await writeDraftDownloadManifest({
                ...latest,
                sourceScriptureError: message,
              });
            }
          }

          const items = await loadChapterItems(request);
          if (scriptureItemCompleted(items, request.chapterAssignmentId)) {
            stopObserverScriptureWatcher(key);
            return;
          }
        } while (rerun && scriptureWatchers.has(key));
      } finally {
        inFlight = false;
      }
    })();
  };

  const unsubscribe = onDownloadQueueChanged(run);
  scriptureWatcherUnsubs.set(key, unsubscribe);
  run();
}

export async function getDraftDownloadState(
  request: Pick<
    DraftDownloadRequest,
    'projectId' | 'userId' | 'chapterAssignmentId' | 'role'
  >,
): Promise<DraftDownloadState> {
  const manifest = await readDraftDownloadManifest(identityOf(request));
  const allItems = await loadChapterItems(request);
  const items = expectedItems(allItems, manifest, request.role);
  const status = deriveStatus(items, manifest, request.role);
  const phase = derivePhase(
    items,
    request.role,
    status,
    request.chapterAssignmentId,
  );
  const progress = aggregateProgress(
    items,
    expectedCount(manifest, request.role),
  );

  const key = sessionKeyOf(request);
  let readyAtMs = readyAtBySession.get(key) ?? null;
  if (status === 'ready') {
    if (readyAtMs === null) {
      readyAtMs = Date.now();
      readyAtBySession.set(key, readyAtMs);
    }
  } else if (status === 'failed' || status === 'idle') {
    readyAtBySession.delete(key);
    readyAtMs = null;
  }

  // Keep status `ready` through hold + fade so the chip can animate out.
  let uiStatus = status;
  if (
    status === 'ready' &&
    readyAtMs !== null &&
    Date.now() - readyAtMs >=
      DRAFT_DOWNLOAD_READY_HOLD_MS + DRAFT_DOWNLOAD_READY_FADE_MS
  ) {
    uiStatus = 'idle';
  }

  return {
    chapterAssignmentId: request.chapterAssignmentId,
    role: request.role,
    status: uiStatus,
    phase,
    progress: uiStatus === 'idle' && status === 'ready' ? 1 : progress,
    readyAtMs,
    errorMessage: manifest?.sourceScriptureError,
  };
}

export function resetDraftDownloadReadyClocksForTests(): void {
  readyAtBySession.clear();
  for (const unsub of scriptureWatcherUnsubs.values()) {
    unsub();
  }
  scriptureWatcherUnsubs.clear();
  scriptureWatchers.clear();
}

function buildAudioAndTextInputs(
  request: DraftDownloadRequest,
  audioItems: ReturnType<typeof resolveActiveTakeDownload>[],
  translatedVerses: TranslatedVerseResponse[],
): EnqueueDownloadItemInput[] {
  const inputs: EnqueueDownloadItemInput[] = [];

  for (const audio of audioItems) {
    const resourceId = draftAudioResourceId(
      request.chapterAssignmentId,
      audio.bibleTextId,
      audio.take.id,
      audio.take.contentHash,
    );
    inputs.push({
      id: resourceId,
      projectId: request.projectId,
      userId: request.userId,
      tier: 1,
      kind: 'audio',
      resourceName: DRAFT_DOWNLOAD_RESOURCE_NAME,
      label: `Draft audio v${audio.verseNumber}`,
      fileExt: contentTypeToAudioExt(audio.take.contentType),
      bytesTotal: audio.take.sizeBytes,
      serializedContent: audioRefreshMeta(
        request,
        audio.bibleTextId,
        audio.take.id,
        audio.take.contentHash,
      ),
      bookCode: request.bookCode,
      startChapter: request.chapterNumber,
      endChapter: request.chapterNumber,
      verseStart: audio.verseNumber,
      verseEnd: audio.verseNumber,
    });
  }

  inputs.push({
    id: draftTextResourceId(request.chapterAssignmentId),
    projectId: request.projectId,
    userId: request.userId,
    tier: 1,
    kind: 'text',
    resourceName: DRAFT_DOWNLOAD_RESOURCE_NAME,
    label: 'Draft text',
    fileExt: 'json',
    serializedContent: JSON.stringify(translatedVerses),
    bookCode: request.bookCode,
    startChapter: request.chapterNumber,
    endChapter: request.chapterNumber,
  });

  return inputs;
}

async function removeStaleDraftRows(
  request: DraftDownloadRequest,
  keepResourceIds: Set<string>,
): Promise<void> {
  const existing = await loadChapterItems(request);
  const worker = getSharedDownloadQueueWorker();
  const stale = existing.filter(
    item => !keepResourceIds.has(item.resourceId ?? item.id),
  );
  if (stale.length === 0) return;
  await worker.dropItems(stale.map(item => item.id));
  for (const item of stale) {
    if (item.localFilePath && item.projectId !== undefined) {
      try {
        await deleteDownloadResourceFile(item.projectId, item.localFilePath);
      } catch (error) {
        log.warn('Failed to delete stale draft file', { error, id: item.id });
      }
    }
    await deleteDownloadItem(item.id);
  }
}

export type StartDraftDownloadResult =
  | { ok: true; enqueuedIds: string[] }
  | {
      ok: false;
      reason: 'transport' | 'no_active_takes' | 'error';
      message?: string;
    };

/**
 * Manual-only start for Observer (#508) / Peer Check (#704).
 * Audio before observer scripture snapshot; peer excludes scripture.
 * Does not write shared bible_texts.
 */
export async function startDraftDownload(
  request: DraftDownloadRequest,
): Promise<StartDraftDownloadResult> {
  const transportSnapshot = await getTransferTransportSnapshot();
  const gate = transportAllowsTransfer(
    transferInputFromLinkSnapshot(transportSnapshot, getUploadOverCellular()),
  );
  if (gate !== 'ok') {
    return { ok: false, reason: 'transport' };
  }

  try {
    const sessionToken = await captureSessionTokenForRequest(request.userId);
    if (!sessionToken) {
      return {
        ok: false,
        reason: 'error',
        message: 'Active account session mismatch',
      };
    }

    const existingManifest = await readDraftDownloadManifest(
      identityOf(request),
    );
    if (existingManifest?.purged) {
      // Clear tombstone by writing a fresh non-purged manifest below.
    }

    if (!isActiveRequestAccount(request.userId)) {
      return {
        ok: false,
        reason: 'error',
        message: 'Active account changed before draft download start',
      };
    }

    const [list, translatedVerses] = await Promise.all([
      FluentAPI.getChapterVerseAudio(
        {
          projectUnitId: request.projectUnitId,
          bibleId: request.bibleId,
          bookId: request.bookId,
          chapterNumber: request.chapterNumber,
        },
        sessionToken,
      ),
      FluentAPI.getTranslatedVerses(
        {
          projectUnitId: request.projectUnitId,
          bookId: request.bookId,
          chapterNumber: request.chapterNumber,
        },
        sessionToken,
      ),
    ]);

    if (!isActiveRequestAccount(request.userId)) {
      return {
        ok: false,
        reason: 'error',
        message: 'Active account changed during draft download start',
      };
    }

    const resolvedAudio = [];
    const unresolved: number[] = [];
    for (const item of list.items) {
      try {
        resolvedAudio.push(resolveActiveTakeDownload(item));
      } catch (error) {
        unresolved.push(item.bibleTextId);
        log.warn('Verse audio unit has no resolvable active take', {
          bibleTextId: item.bibleTextId,
          activeTakeId: item.activeTakeId,
          conflictStatus: item.conflictStatus,
          error,
        });
      }
    }

    if (resolvedAudio.length === 0 || unresolved.length > 0) {
      // Do not report ready while any chapter unit lacks an exact active take.
      if (resolvedAudio.length === 0) {
        return { ok: false, reason: 'no_active_takes' };
      }
      return {
        ok: false,
        reason: 'no_active_takes',
        message: `Unresolved active takes for bibleTextIds: ${unresolved.join(
          ',',
        )}`,
      };
    }

    const units = resolvedAudio.map(audio => ({
      bibleTextId: audio.bibleTextId,
      verseNumber: audio.verseNumber,
      conflictStatus: audio.conflictStatus,
      activeTakeId: audio.take.id,
      contentHash: audio.take.contentHash,
      resourceId: draftAudioResourceId(
        request.chapterAssignmentId,
        audio.bibleTextId,
        audio.take.id,
        audio.take.contentHash,
      ),
      coverage: audio.coverage,
    }));

    const keepIds = new Set<string>([
      ...units.map(unit => unit.resourceId),
      draftTextResourceId(request.chapterAssignmentId),
    ]);
    await removeStaleDraftRows(request, keepIds);

    const manifest: DraftDownloadManifest = {
      chapterAssignmentId: request.chapterAssignmentId,
      projectId: request.projectId,
      userId: request.userId,
      role: request.role,
      projectUnitId: request.projectUnitId,
      bibleId: request.bibleId,
      bookId: request.bookId,
      bookCode: request.bookCode,
      chapterNumber: request.chapterNumber,
      units,
      purgeGeneration: existingManifest?.purgeGeneration ?? 0,
      purged: false,
      sourceScriptureError: undefined,
    };
    await writeDraftDownloadManifest(manifest);

    const inputs = buildAudioAndTextInputs(
      request,
      resolvedAudio,
      translatedVerses,
    );

    const existing = await loadChapterItems(request);
    const retryIds = existing
      .filter(
        item =>
          keepIds.has(item.resourceId ?? item.id) &&
          (item.status === 'failed' ||
            item.status === 'cancelled' ||
            item.status === 'paused'),
      )
      .map(item => item.id);
    if (retryIds.length > 0) {
      await requeueDownloadItems(retryIds);
    }

    const enqueuedIds = await enqueueDownloadItems(inputs);
    const toRun = (await loadChapterItems(request)).filter(
      item =>
        keepIds.has(item.resourceId ?? item.id) &&
        (item.status === 'queued' ||
          item.status === 'failed' ||
          item.status === 'downloading'),
    );

    watchObserverScripture(request);

    const worker = getSharedDownloadQueueWorker();
    const workerState = worker.getState();
    if (workerState === 'idle' || workerState === 'cancelled') {
      if (toRun.length > 0) {
        void worker.start(toRun);
      }
    } else if (workerState === 'downloading') {
      worker.enqueueAdditional(toRun);
    } else if (workerState === 'paused') {
      // Append only — do not resume a user-paused PFO session.
      worker.enqueueAdditional(toRun);
    }

    readyAtBySession.delete(sessionKeyOf(request));
    log.info('Draft download started', {
      chapterAssignmentId: request.chapterAssignmentId,
      userId: request.userId,
      role: request.role,
      enqueuedCount: enqueuedIds.length,
      audioCount: resolvedAudio.length,
    });

    return { ok: true, enqueuedIds };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Draft download failed';
    log.error('Draft download start failed', {
      error,
      chapterAssignmentId: request.chapterAssignmentId,
      userId: request.userId,
    });
    return { ok: false, reason: 'error', message };
  }
}

async function readSourceScriptureSnapshot(
  request: Pick<
    DraftDownloadRequest,
    | 'projectId'
    | 'userId'
    | 'chapterAssignmentId'
    | 'role'
    | 'bibleId'
    | 'bookId'
    | 'chapterNumber'
  >,
  items: DownloadQueueItem[],
): Promise<DraftSourceScriptureSnapshot | null> {
  if (request.role !== 'observer') return null;
  const row = items.find(
    item =>
      (item.resourceId ?? item.id) ===
      draftScriptureResourceId(request.chapterAssignmentId),
  );
  if (row?.status !== 'completed' || !row.localFilePath) return null;
  if (!(await fileExists(row.localFilePath))) return null;
  const parsed = await readLocalJsonFile<{
    bibleId: number;
    bookId: number;
    chapterNumber: number;
    verses: Array<{ id: number; verseNumber: number; text: string }>;
  }>(row.localFilePath);
  if (
    !parsed ||
    !Array.isArray(parsed.verses) ||
    parsed.verses.length === 0 ||
    parsed.bibleId !== request.bibleId ||
    parsed.bookId !== request.bookId ||
    parsed.chapterNumber !== request.chapterNumber
  ) {
    return null;
  }
  return {
    bibleId: parsed.bibleId,
    bookId: parsed.bookId,
    chapterNumber: parsed.chapterNumber,
    verses: parsed.verses,
    localFilePath: row.localFilePath,
  };
}

/**
 * Local playback URIs + verse anchors + preserved conflict state for Observer.
 * Fail closed when take/hash identity is missing — no invented clean/activeTakeId 0.
 */
export async function getDraftChapterLocalBundle(
  request: Pick<
    DraftDownloadRequest,
    | 'projectId'
    | 'userId'
    | 'chapterAssignmentId'
    | 'role'
    | 'bibleId'
    | 'bookId'
    | 'chapterNumber'
  >,
): Promise<DraftChapterLocalBundle> {
  const manifest = await readDraftDownloadManifest(identityOf(request));
  const allItems = await loadChapterItems(request);
  const items = expectedItems(allItems, manifest, request.role);
  const status = deriveStatus(items, manifest, request.role);

  const textItem = items.find(
    item =>
      (item.resourceId ?? item.id) ===
      draftTextResourceId(request.chapterAssignmentId),
  );
  const translatedVerses =
    (await readLocalJsonFile<TranslatedVerseResponse[]>(
      textItem?.localFilePath,
    )) ?? [];
  const textByBibleTextId = new Map(
    Array.isArray(translatedVerses)
      ? translatedVerses.map(verse => [verse.bibleTextId, verse])
      : [],
  );

  const units: DraftDownloadUnitAnchor[] = [];
  let hasConflict = false;
  const byResource = new Map(
    items.map(item => [item.resourceId ?? item.id, item]),
  );

  for (const meta of manifest?.units ?? []) {
    const verse = textByBibleTextId.get(meta.bibleTextId);
    const item = byResource.get(meta.resourceId);
    const conflictStatus = meta.conflictStatus;
    if (conflictStatus === 'conflict') {
      hasConflict = true;
    }

    let localPlaybackUri: string | null = null;
    if (
      item?.status === 'completed' &&
      item.localFilePath &&
      (await fileExists(item.localFilePath))
    ) {
      // Identity is bound in resourceId + manifest; only expose when matched.
      localPlaybackUri = item.localFilePath;
    }

    units.push({
      bibleTextId: meta.bibleTextId,
      verseNumber: meta.verseNumber,
      markers: verse?.markers ?? null,
      conflictStatus,
      activeTakeId: meta.activeTakeId,
      contentHash: meta.contentHash,
      coverage: meta.coverage ?? null,
      localPlaybackUri,
      draftText: verse?.content ?? null,
    });
  }

  // Stale queue rows not in the manifest are ignored (no invented metadata).
  units.sort((a, b) => a.verseNumber - b.verseNumber);

  const sourceScripture = await readSourceScriptureSnapshot(request, items);

  return {
    chapterAssignmentId: request.chapterAssignmentId,
    role: request.role,
    status,
    hasConflict,
    units,
    sourceScripture,
  };
}
