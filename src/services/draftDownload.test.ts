const mockEnqueue = jest.fn();
const mockGetByPrefix = jest.fn();
const mockRequeue = jest.fn();
const mockDeleteItem = jest.fn();
const mockGetChapterVerseAudio = jest.fn();
const mockGetTranslatedVerses = jest.fn();
const mockGetBibleTexts = jest.fn();
const mockWorkerStart = jest.fn();
const mockWorkerResume = jest.fn();
const mockWorkerEnqueueAdditional = jest.fn();
const mockWorkerDropItems = jest.fn();
const mockWorkerGetState = jest.fn(() => 'idle');
const mockWriteManifest = jest.fn();
const mockWriteTombstone = jest.fn();
const mockReadManifest = jest.fn();
const mockTransportSnapshot = jest.fn();
const mockDeleteFile = jest.fn();
const mockGetActiveUserId = jest.fn(() => '7');
const mockGetCredentials = jest.fn(async (_userId: string) => ({
  token: 'session-tok-7',
}));

jest.mock('../db/downloadQueueRepository', () => ({
  enqueueDownloadItems: (...args: unknown[]) => mockEnqueue(...args),
  getDownloadQueueItemsByResourcePrefix: (...args: unknown[]) =>
    mockGetByPrefix(...args),
  requeueDownloadItems: (...args: unknown[]) => mockRequeue(...args),
  deleteDownloadItem: (...args: unknown[]) => mockDeleteItem(...args),
  markDownloadItemCancelled: jest.fn(),
}));

jest.mock('./api', () => ({
  FluentAPI: {
    getChapterVerseAudio: (...args: unknown[]) =>
      mockGetChapterVerseAudio(...args),
    getTranslatedVerses: (...args: unknown[]) =>
      mockGetTranslatedVerses(...args),
    getBibleTexts: (...args: unknown[]) => mockGetBibleTexts(...args),
  },
}));

jest.mock('./downloadQueueWorkerSingleton', () => ({
  getSharedDownloadQueueWorker: () => ({
    start: (...args: unknown[]) => mockWorkerStart(...args),
    resume: (...args: unknown[]) => mockWorkerResume(...args),
    enqueueAdditional: (...args: unknown[]) =>
      mockWorkerEnqueueAdditional(...args),
    dropItems: (...args: unknown[]) => mockWorkerDropItems(...args),
    getState: () => mockWorkerGetState(),
  }),
}));

jest.mock('./draftDownloadManifest', () => ({
  runDraftDownloadPublication: jest.requireActual('./draftDownloadManifest')
    .runDraftDownloadPublication,
  writeDraftDownloadManifest: (...args: unknown[]) =>
    mockWriteManifest(...args),
  readDraftDownloadManifest: (...args: unknown[]) => mockReadManifest(...args),
  deleteDraftDownloadManifest: jest.fn(),
  writeDraftDownloadPurgeTombstone: (...args: unknown[]) =>
    mockWriteTombstone(...args),
}));

jest.mock('./downloadStorage', () => ({
  fileExists: jest.fn(async () => true),
  deleteDownloadResourceFile: (...args: unknown[]) => mockDeleteFile(...args),
}));

jest.mock('./connectivity', () => ({
  getTransferTransportSnapshot: (...args: unknown[]) =>
    mockTransportSnapshot(...args),
}));

jest.mock('./userPreferences', () => ({
  getUploadOverCellular: () => false,
}));

jest.mock('./storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
}));

jest.mock('./keychain', () => ({
  getCredentials: (userId: string) => mockGetCredentials(userId),
}));

jest.mock('../utils/downloadQueueEvents', () => ({
  onDownloadQueueChanged: () => () => undefined,
  emitDownloadQueueChanged: jest.fn(),
}));

import {
  awaitDraftFreshnessChecksForTests,
  getDraftChapterLocalBundle,
  getDraftDownloadState,
  resetDraftDownloadReadyClocksForTests,
  startDraftDownload,
  DRAFT_DOWNLOAD_READY_HOLD_MS,
  DRAFT_DOWNLOAD_READY_FADE_MS,
} from './draftDownload';
import { draftAudioResourceId } from './draftDownloadIds';
import { purgeDraftDownloadsOnStageExit } from './draftDownloadPurge';
import type { DraftDownloadManifest } from './draftDownloadManifest';
import type { DownloadQueueItem } from '../types/download/types';
import {
  clearDraftListingSnapshots,
  readDraftListingSnapshot,
} from './draftListingSnapshot';

const request = {
  chapterAssignmentId: 9,
  projectUnitId: 12,
  projectId: 1,
  userId: 7,
  bibleId: 1,
  bookId: 41,
  bookCode: 'MRK',
  chapterNumber: 1,
  role: 'peer_check' as const,
};

const take = {
  id: 10,
  uploadedBy: 3,
  contentType: 'audio/mp4',
  sizeBytes: 2048,
  durationSeconds: 12.5,
  contentHash: 'abc123hash',
  downloadUrl: 'https://example.test/take',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

const audioResourceId = draftAudioResourceId(9, 3401, 10, 'abc123hash');

describe('startDraftDownload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDraftListingSnapshots();
    resetDraftDownloadReadyClocksForTests();
    mockGetActiveUserId.mockReturnValue('7');
    mockGetCredentials.mockResolvedValue({ token: 'session-tok-7' });
    mockTransportSnapshot.mockResolvedValue({
      isLinkOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    mockGetChapterVerseAudio.mockResolvedValue({
      items: [
        {
          id: 9,
          projectUnitId: 12,
          bibleTextId: 3401,
          uploadedBy: 3,
          contentType: 'audio/mp4',
          sizeBytes: 4096,
          durationSeconds: 12.5,
          versionToken: 2,
          conflictStatus: 'conflict',
          activeTakeId: 10,
          takes: [take],
          verseNumber: 1,
          downloadUrl: 'https://example.test/top',
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:00:00.000Z',
        },
      ],
      hasConflict: true,
    });
    mockGetTranslatedVerses.mockResolvedValue([
      {
        id: 1,
        projectUnitId: 12,
        bibleTextId: 3401,
        assignedUserId: null,
        content: 'Hello',
        markers: null,
        verseNumber: 1,
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    ]);
    mockEnqueue.mockResolvedValue([`1-7-${audioResourceId}`]);
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${audioResourceId}`,
        resourceId: audioResourceId,
        status: 'queued',
        kind: 'audio',
        progress: 0,
      },
      {
        id: '1-7-draft-text-9',
        resourceId: 'draft-text-9',
        status: 'queued',
        kind: 'text',
        progress: 0,
      },
    ]);
    mockRequeue.mockResolvedValue(undefined);
    mockDeleteItem.mockResolvedValue(undefined);
    mockWriteManifest.mockResolvedValue('file:///manifest.json');
    mockReadManifest.mockResolvedValue(null);
    mockWorkerStart.mockResolvedValue(undefined);
    mockWorkerDropItems.mockResolvedValue(undefined);
  });

  it('enqueues take/hash-bound audio before draft text; peer excludes scripture', async () => {
    const result = await startDraftDownload(request);
    expect(result.ok).toBe(true);

    expect(mockGetCredentials).toHaveBeenCalledWith('7');
    expect(mockGetChapterVerseAudio).toHaveBeenCalledWith(
      expect.any(Object),
      'session-tok-7',
    );
    expect(mockGetTranslatedVerses).toHaveBeenCalledWith(
      expect.any(Object),
      'session-tok-7',
    );

    const inputs = mockEnqueue.mock.calls[0]?.[0] as Array<{
      id: string;
      kind: string;
      sourceUrl?: string;
      serializedContent?: string;
    }>;
    expect(inputs.map(i => i.id)).toEqual([audioResourceId, 'draft-text-9']);
    expect(inputs[0]?.kind).toBe('audio');
    expect(inputs[0]?.sourceUrl).toBeUndefined();
    expect(inputs[0]?.serializedContent).toContain('"expectedActiveTakeId":10');
    expect(inputs[0]?.serializedContent).toContain(
      '"expectedContentHash":"abc123hash"',
    );
    expect(inputs.some(i => i.id.startsWith('draft-scripture-'))).toBe(false);
    expect(mockGetBibleTexts).not.toHaveBeenCalled();
    expect(mockWorkerStart).toHaveBeenCalled();
    expect(mockWorkerResume).not.toHaveBeenCalled();
  });

  it('seeds the chapter listing snapshot for the worker from the manifest listing (#886)', async () => {
    const result = await startDraftDownload(request);
    expect(result.ok).toBe(true);

    const snapshot = readDraftListingSnapshot(
      { projectUnitId: 12, bibleId: 1, bookId: 41, chapterNumber: 1 },
      '7',
    );
    expect(snapshot?.list.items.map(item => item.bibleTextId)).toEqual([3401]);
    // Keyed per user: another account does not see it.
    expect(
      readDraftListingSnapshot(
        { projectUnitId: 12, bibleId: 1, bookId: 41, chapterNumber: 1 },
        '8',
      ),
    ).toBeNull();
  });

  it('does not seed the snapshot when the account changed during the listing', async () => {
    mockGetChapterVerseAudio.mockImplementation(async () => {
      mockGetActiveUserId.mockReturnValue('99');
      return { items: [], hasConflict: false };
    });

    const result = await startDraftDownload(request);
    expect(result.ok).toBe(false);
    expect(
      readDraftListingSnapshot(
        { projectUnitId: 12, bibleId: 1, bookId: 41, chapterNumber: 1 },
        '7',
      ),
    ).toBeNull();
  });

  it('fail-closes when active account changes before list/text responses apply', async () => {
    mockGetChapterVerseAudio.mockImplementation(async () => {
      mockGetActiveUserId.mockReturnValue('99');
      return {
        items: [
          {
            id: 9,
            projectUnitId: 12,
            bibleTextId: 3401,
            uploadedBy: 3,
            contentType: 'audio/mp4',
            sizeBytes: 4096,
            durationSeconds: 12.5,
            versionToken: 2,
            conflictStatus: 'conflict',
            activeTakeId: 10,
            takes: [take],
            verseNumber: 1,
            downloadUrl: 'https://example.test/top',
            createdAt: '2026-07-15T00:00:00.000Z',
            updatedAt: '2026-07-15T00:00:00.000Z',
          },
        ],
        hasConflict: true,
      };
    });

    const result = await startDraftDownload(request);
    expect(result).toEqual({
      ok: false,
      reason: 'error',
      message: 'Active account changed during draft download start',
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockWriteManifest).not.toHaveBeenCalled();
  });

  it('fail-closes when request userId is not the active account', async () => {
    mockGetActiveUserId.mockReturnValue('99');
    const result = await startDraftDownload(request);
    expect(result).toEqual({
      ok: false,
      reason: 'error',
      message: 'Active account session mismatch',
    });
    expect(mockGetChapterVerseAudio).not.toHaveBeenCalled();
  });

  it('appends to the shared worker when already downloading (no second engine)', async () => {
    mockWorkerGetState.mockReturnValue('downloading');
    await startDraftDownload(request);
    expect(mockWorkerStart).not.toHaveBeenCalled();
    expect(mockWorkerResume).not.toHaveBeenCalled();
    expect(mockWorkerEnqueueAdditional).toHaveBeenCalled();
  });

  it('appends but does not resume when worker is user-paused', async () => {
    mockWorkerGetState.mockReturnValue('paused');
    await startDraftDownload(request);
    expect(mockWorkerResume).not.toHaveBeenCalled();
    expect(mockWorkerEnqueueAdditional).toHaveBeenCalled();
  });

  it('replaces existing draft text row on re-download (stable resource id)', async () => {
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${audioResourceId}`,
        resourceId: audioResourceId,
        status: 'completed',
        kind: 'audio',
        progress: 1,
        localFilePath: 'file:///audio.m4a',
        projectId: 1,
      },
      {
        id: '1-7-draft-text-9',
        resourceId: 'draft-text-9',
        status: 'completed',
        kind: 'text',
        progress: 1,
        localFilePath: 'file:///old-text.json',
        projectId: 1,
        serializedContent: null,
      },
    ]);

    const result = await startDraftDownload(request);
    expect(result.ok).toBe(true);
    expect(mockWorkerDropItems).toHaveBeenCalledWith(['1-7-draft-text-9']);
    expect(mockDeleteItem).toHaveBeenCalledWith('1-7-draft-text-9');
    expect(mockDeleteFile).toHaveBeenCalledWith(1, 'file:///old-text.json');
    expect(mockEnqueue).toHaveBeenCalled();
    const inputs = mockEnqueue.mock.calls[0]?.[0] as Array<{ id: string }>;
    expect(inputs.map(i => i.id)).toContain('draft-text-9');
  });

  it('rejects when any chapter unit lacks an exact active take', async () => {
    mockGetChapterVerseAudio.mockResolvedValue({
      items: [
        {
          id: 9,
          projectUnitId: 12,
          bibleTextId: 3401,
          uploadedBy: 3,
          contentType: 'audio/mp4',
          sizeBytes: 4096,
          durationSeconds: 12.5,
          versionToken: 2,
          conflictStatus: 'clean',
          activeTakeId: null,
          takes: [take],
          verseNumber: 1,
          downloadUrl: 'https://example.test/top',
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:00:00.000Z',
        },
      ],
      hasConflict: false,
    });
    const result = await startDraftDownload(request);
    expect(result).toEqual({ ok: false, reason: 'no_active_takes' });
    // A listing with an unresolvable unit must not be cached for the worker.
    expect(
      readDraftListingSnapshot(
        { projectUnitId: 12, bibleId: 1, bookId: 41, chapterNumber: 1 },
        '7',
      ),
    ).toBeNull();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it.each(['peer_check', 'observer'] as const)(
    'orders a %s purge after an in-progress queue publication so no late rows survive',
    async purgeRole => {
      let manifest: DraftDownloadManifest | null = null;
      let rows: DownloadQueueItem[] = [];
      let entered!: () => void;
      let release!: () => void;
      const blocked = new Promise<void>(resolve => {
        release = resolve;
      });
      const enqueueStarted = new Promise<void>(resolve => {
        entered = resolve;
      });
      mockReadManifest.mockImplementation(async () => manifest);
      mockWriteManifest.mockImplementation(async next => {
        manifest = next;
        return 'file:///manifest';
      });
      mockWriteTombstone.mockImplementation(async () => {
        manifest = {
          ...manifest!,
          purged: true,
          purgeGeneration: 1,
          units: [],
        };
      });
      mockGetByPrefix.mockImplementation(async () => rows);
      mockEnqueue.mockImplementation(async inputs => {
        entered();
        await blocked;
        rows = inputs.map((input: DownloadQueueItem) => ({
          ...input,
          status: 'queued',
          resourceId: input.id,
        }));
        return rows.map(row => row.id);
      });
      mockDeleteItem.mockImplementation(async id => {
        rows = rows.filter(row => row.id !== id);
      });
      const start = startDraftDownload(request);
      await enqueueStarted;
      const purge = purgeDraftDownloadsOnStageExit({
        ...request,
        role: purgeRole,
        leftStage: 'peer_check',
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(mockWriteTombstone).not.toHaveBeenCalled();
      release();
      await start;
      await purge;
      expect(rows).toEqual([]);
      expect(manifest).toMatchObject({ purged: true });
      expect(mockWorkerDropItems).toHaveBeenCalledWith(
        expect.arrayContaining([audioResourceId, 'draft-text-9']),
      );
    },
  );

  it('does not start old-owner work after an account switch during publication', async () => {
    mockEnqueue.mockImplementationOnce(async () => {
      mockGetActiveUserId.mockReturnValue('8');
      return ['audio'];
    });
    expect(await startDraftDownload(request)).toMatchObject({ ok: false });
    expect(mockWorkerStart).not.toHaveBeenCalled();
    expect(mockWorkerEnqueueAdditional).not.toHaveBeenCalled();
  });

  describe('offline snapshot vs server freshness', () => {
    let current: DraftDownloadManifest | null;
    let startListing: { items: Array<Record<string, unknown>> };
    const completedRows = [
      {
        id: 'audio',
        resourceId: audioResourceId,
        kind: 'audio',
        status: 'completed',
        progress: 1,
        localFilePath: 'file:///a',
      },
      {
        id: 'text',
        resourceId: 'draft-text-9',
        kind: 'text',
        status: 'completed',
        progress: 1,
        localFilePath: 'file:///t',
      },
    ];
    const offline = { isLinkOnline: false, isWifi: false, isCellular: false };
    const cellular = { isLinkOnline: true, isWifi: false, isCellular: true };
    const wifi = { isLinkOnline: true, isWifi: true, isCellular: false };

    async function completeDownload(): Promise<void> {
      await startDraftDownload(request);
      current = mockWriteManifest.mock.calls[0][0];
      expect(current?.audioValidation).toBe('pending');
      startListing = await mockGetChapterVerseAudio.mock.results[0].value;
      mockReadManifest.mockImplementation(async () => current);
      // Same guard as writeDraftDownloadManifest: superseded writes are dropped.
      mockWriteManifest.mockImplementation(
        async (next: DraftDownloadManifest) => {
          if (
            current &&
            (current.purged ||
              current.purgeGeneration !== next.purgeGeneration ||
              current.audioValidationId !== next.audioValidationId)
          )
            return null;
          current = next;
          return 'file:///manifest.json';
        },
      );
      mockGetByPrefix.mockResolvedValue(completedRows);
      mockGetChapterVerseAudio.mockClear();
    }

    function advanceClock(ms: number): jest.SpyInstance {
      const at = Date.now() + ms;
      return jest.spyOn(Date, 'now').mockReturnValue(at);
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('treats a snapshot with no validation field as not yet checked', async () => {
      await completeDownload();
      current = { ...current!, audioValidation: undefined };
      const state = await getDraftDownloadState(request);
      expect(state).toMatchObject({ status: 'ready', freshness: 'pending' });
      await awaitDraftFreshnessChecksForTests();
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
      expect(current?.audioValidation).toBe('confirmed');
    });

    it('is playable at once and confirmed by one background listing', async () => {
      await completeDownload();
      const state = await getDraftDownloadState(request);
      expect(state).toMatchObject({ status: 'ready', freshness: 'pending' });
      await awaitDraftFreshnessChecksForTests();
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
      expect(current?.audioValidation).toBe('confirmed');
      expect(await getDraftDownloadState(request)).toMatchObject({
        status: 'ready',
        freshness: 'confirmed',
      });
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
    });

    it('never waits on the network to read state or playback URIs', async () => {
      await completeDownload();
      mockGetChapterVerseAudio.mockReturnValue(new Promise(() => undefined));
      const state = await getDraftDownloadState(request);
      const bundle = await getDraftChapterLocalBundle(request);
      expect(state).toMatchObject({ status: 'ready', freshness: 'pending' });
      expect(bundle.freshness).toBe('pending');
      expect(bundle.units[0].localPlaybackUri).toBe('file:///a');
    });

    it('stays playable when the link drops before the final listing, with backed-off retries', async () => {
      await completeDownload();
      mockGetChapterVerseAudio.mockRejectedValue(
        new Error('Network request failed'),
      );
      await getDraftDownloadState(request);
      await awaitDraftFreshnessChecksForTests();
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
      expect(current?.audioValidation).toBe('pending');

      let clock = advanceClock(6_000);
      expect(await getDraftDownloadState(request)).toMatchObject({
        status: 'ready',
        freshness: 'pending',
      });
      await awaitDraftFreshnessChecksForTests();
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
      clock.mockRestore();

      clock = advanceClock(11_000);
      await getDraftDownloadState(request);
      await awaitDraftFreshnessChecksForTests();
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(2);
      expect(
        (await getDraftChapterLocalBundle(request)).units[0].localPlaybackUri,
      ).toBe('file:///a');
      clock.mockRestore();
    });

    it('does not use cellular under the Wi-Fi-only policy, yet plays locally', async () => {
      await completeDownload();
      mockTransportSnapshot.mockResolvedValue(cellular);
      const state = await getDraftDownloadState(request);
      await awaitDraftFreshnessChecksForTests();
      expect(state).toMatchObject({ status: 'ready', freshness: 'pending' });
      expect(mockGetChapterVerseAudio).not.toHaveBeenCalled();
      expect(
        (await getDraftChapterLocalBundle(request)).units[0].localPlaybackUri,
      ).toBe('file:///a');
    });

    it('serves a pending snapshot after an app restart and revalidates it', async () => {
      await completeDownload();
      mockTransportSnapshot.mockResolvedValue(offline);
      await getDraftDownloadState(request);
      await awaitDraftFreshnessChecksForTests();
      resetDraftDownloadReadyClocksForTests();
      mockTransportSnapshot.mockResolvedValue(wifi);
      const bundle = await getDraftChapterLocalBundle(request);
      expect(bundle).toMatchObject({ status: 'ready', freshness: 'pending' });
      expect(bundle.units[0].localPlaybackUri).toBe('file:///a');
      await awaitDraftFreshnessChecksForTests();
      expect(current?.audioValidation).toBe('confirmed');
    });

    it('drops a pending check that settles after an account switch', async () => {
      await completeDownload();
      let resolveListing!: (value: unknown) => void;
      mockGetChapterVerseAudio.mockReturnValue(
        new Promise(resolve => {
          resolveListing = resolve;
        }),
      );
      await getDraftDownloadState(request);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      mockGetActiveUserId.mockReturnValue('8');
      resolveListing(startListing);
      await awaitDraftFreshnessChecksForTests();
      expect(current?.audioValidation).toBe('pending');
    });

    it('drops a pending check that settles after a stage purge', async () => {
      await completeDownload();
      let resolveListing!: (value: unknown) => void;
      mockGetChapterVerseAudio.mockReturnValue(
        new Promise(resolve => {
          resolveListing = resolve;
        }),
      );
      await getDraftDownloadState(request);
      current = { ...current!, purged: true, purgeGeneration: 1, units: [] };
      resolveListing(startListing);
      await awaitDraftFreshnessChecksForTests();
      expect(current).toMatchObject({ purged: true, purgeGeneration: 1 });
      expect(await getDraftDownloadState(request)).toMatchObject({
        status: 'idle',
      });
      expect((await getDraftChapterLocalBundle(request)).units).toEqual([]);
    });

    it('withdraws playback when the server selection changed while offline', async () => {
      await completeDownload();
      mockTransportSnapshot.mockResolvedValue(offline);
      await getDraftDownloadState(request);
      await awaitDraftFreshnessChecksForTests();
      expect(
        (await getDraftChapterLocalBundle(request)).units[0].localPlaybackUri,
      ).toBe('file:///a');

      mockTransportSnapshot.mockResolvedValue(wifi);
      mockGetChapterVerseAudio.mockResolvedValue({
        ...startListing,
        items: startListing.items.map(item => ({ ...item, activeTakeId: 99 })),
      });
      const clock = advanceClock(6_000);
      await getDraftDownloadState(request);
      await awaitDraftFreshnessChecksForTests();
      expect(current?.audioValidation).toBe('stale');
      expect(await getDraftDownloadState(request)).toMatchObject({
        status: 'failed',
        errorMessage: expect.stringContaining('changed on the server'),
      });
      const bundle = await getDraftChapterLocalBundle(request);
      expect(bundle.freshness).toBeUndefined();
      expect(bundle.units[0].localPlaybackUri).toBeNull();
      clock.mockRestore();
    });
  });

  it('keeps status ready through hold+fade window', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    mockReadManifest.mockResolvedValue({
      chapterAssignmentId: 9,
      projectId: 1,
      userId: 7,
      role: 'peer_check',
      projectUnitId: 12,
      bibleId: 1,
      bookId: 41,
      bookCode: 'MRK',
      chapterNumber: 1,
      units: [
        {
          bibleTextId: 3401,
          verseNumber: 1,
          conflictStatus: 'conflict',
          activeTakeId: 10,
          contentHash: 'abc123hash',
          resourceId: audioResourceId,
        },
      ],
      purgeGeneration: 0,
      purged: false,
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${audioResourceId}`,
        resourceId: audioResourceId,
        status: 'completed',
        kind: 'audio',
        progress: 1,
        localFilePath: 'file:///a.m4a',
      },
      {
        id: '1-7-draft-text-9',
        resourceId: 'draft-text-9',
        status: 'completed',
        kind: 'text',
        progress: 1,
        localFilePath: 'file:///t.json',
      },
    ]);

    const first = await getDraftDownloadState(request);
    expect(first.status).toBe('ready');
    expect(first.readyAtMs).toBe(now);

    jest
      .spyOn(Date, 'now')
      .mockReturnValue(now + DRAFT_DOWNLOAD_READY_HOLD_MS + 50);
    const duringFade = await getDraftDownloadState(request);
    expect(duringFade.status).toBe('ready');

    jest
      .spyOn(Date, 'now')
      .mockReturnValue(
        now + DRAFT_DOWNLOAD_READY_HOLD_MS + DRAFT_DOWNLOAD_READY_FADE_MS + 1,
      );
    const after = await getDraftDownloadState(request);
    expect(after.status).toBe('idle');
    expect(after.progress).toBe(1);
  });
});
