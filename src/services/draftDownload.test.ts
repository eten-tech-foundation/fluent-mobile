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
  writeDraftDownloadManifest: (...args: unknown[]) =>
    mockWriteManifest(...args),
  readDraftDownloadManifest: (...args: unknown[]) => mockReadManifest(...args),
  deleteDraftDownloadManifest: jest.fn(),
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
}));

import {
  getDraftDownloadState,
  resetDraftDownloadReadyClocksForTests,
  startDraftDownload,
  DRAFT_DOWNLOAD_READY_HOLD_MS,
  DRAFT_DOWNLOAD_READY_FADE_MS,
} from './draftDownload';
import { draftAudioResourceId } from './draftDownloadIds';

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
    expect(mockEnqueue).not.toHaveBeenCalled();
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
          coverage: null,
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
