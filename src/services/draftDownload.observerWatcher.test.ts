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
const mockFileExists = jest.fn(async (_path: string) => true);
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
  fileExists: (path: string) => mockFileExists(path),
  deleteDownloadResourceFile: jest.fn(),
}));

jest.mock('./connectivity', () => ({
  getTransferTransportSnapshot: () => mockTransportSnapshot(),
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

// Real queue events — do not mock downloadQueueEvents.

import {
  emitDownloadQueueChanged,
  onDownloadQueueChanged,
} from '../utils/downloadQueueEvents';
import {
  getDraftDownloadState,
  resetDraftDownloadReadyClocksForTests,
  startDraftDownload,
} from './draftDownload';
import { draftAudioResourceId } from './draftDownloadIds';

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

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

const observerRequest = {
  chapterAssignmentId: 9,
  projectUnitId: 12,
  projectId: 1,
  userId: 7,
  bibleId: 1,
  bookId: 41,
  bookCode: 'MRK',
  chapterNumber: 1,
  role: 'observer' as const,
};

function baseManifest(
  overrides: {
    purged?: boolean;
    purgeGeneration?: number;
    sourceScriptureError?: string;
  } = {},
) {
  return {
    chapterAssignmentId: 9,
    projectId: 1,
    userId: 7,
    role: 'observer' as const,
    projectUnitId: 12,
    bibleId: 1,
    bookId: 41,
    bookCode: 'MRK',
    chapterNumber: 1,
    units: [
      {
        bibleTextId: 3401,
        verseNumber: 1,
        conflictStatus: 'conflict' as const,
        activeTakeId: 10,
        contentHash: 'abc123hash',
        resourceId: audioResourceId,
        coverage: null,
      },
    ],
    purgeGeneration: 0,
    purged: false,
    sourceScriptureError: undefined as string | undefined,
    ...overrides,
  };
}

function completedAudioAndTextRows() {
  return [
    {
      id: `1-7-${audioResourceId}`,
      resourceId: audioResourceId,
      status: 'completed' as const,
      kind: 'audio' as const,
      progress: 1,
      localFilePath: 'file:///a.m4a',
      userId: 7,
      projectId: 1,
    },
    {
      id: '1-7-draft-text-9',
      resourceId: 'draft-text-9',
      status: 'completed' as const,
      kind: 'text' as const,
      progress: 1,
      localFilePath: 'file:///t.json',
      userId: 7,
      projectId: 1,
    },
  ];
}

describe('observer scripture watcher integration', () => {
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
    mockFileExists.mockResolvedValue(true);
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
    mockEnqueue.mockImplementation(async (inputs: Array<{ id: string }>) =>
      inputs.map(i => `1-7-${i.id}`),
    );
    mockRequeue.mockResolvedValue(undefined);
    mockWriteManifest.mockResolvedValue('file:///manifest.json');
    mockWorkerStart.mockResolvedValue(undefined);
    mockWorkerDropItems.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Drain any watchers registered during the test.
    resetDraftDownloadReadyClocksForTests();
  });

  it('waits for audio+text completion before getBibleTexts; scripture JSON reaches worker', async () => {
    let manifest = baseManifest();
    mockReadManifest.mockImplementation(async () => manifest);
    mockWriteManifest.mockImplementation(async next => {
      manifest = { ...manifest, ...next };
      return 'file:///manifest.json';
    });

    // Start: audio+text queued only — scripture must not fetch yet.
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${audioResourceId}`,
        resourceId: audioResourceId,
        status: 'queued',
        kind: 'audio',
        progress: 0,
        userId: 7,
        projectId: 1,
      },
      {
        id: '1-7-draft-text-9',
        resourceId: 'draft-text-9',
        status: 'queued',
        kind: 'text',
        progress: 0,
        userId: 7,
        projectId: 1,
      },
    ]);

    const start = await startDraftDownload(observerRequest);
    expect(start.ok).toBe(true);
    await flush();
    expect(mockGetBibleTexts).not.toHaveBeenCalled();

    const verses = [
      { id: 100, verseNumber: 1, text: 'In the beginning' },
      { id: 101, verseNumber: 2, text: 'was the Word' },
    ];
    mockGetBibleTexts.mockResolvedValue({
      data: [
        {
          bookId: 41,
          chapterNumber: 1,
          verses,
        },
      ],
    });

    const scriptureRow = {
      id: '1-7-draft-scripture-9',
      resourceId: 'draft-scripture-9',
      status: 'queued' as const,
      kind: 'text' as const,
      progress: 0,
      userId: 7,
      projectId: 1,
      serializedContent: JSON.stringify({
        bibleId: 1,
        bookId: 41,
        chapterNumber: 1,
        verses,
      }),
    };

    mockGetByPrefix.mockResolvedValue([
      ...completedAudioAndTextRows(),
      // no scripture yet until enqueue
    ]);
    mockEnqueue.mockImplementation(async (inputs: Array<{ id: string }>) => {
      mockGetByPrefix.mockResolvedValue([
        ...completedAudioAndTextRows(),
        scriptureRow,
      ]);
      return inputs.map(i => `1-7-${i.id}`);
    });

    emitDownloadQueueChanged();
    await flush();
    await flush();

    expect(mockGetBibleTexts).toHaveBeenCalledTimes(1);
    expect(mockGetBibleTexts).toHaveBeenCalledWith(1, [
      { bookId: 41, chapterNumber: 1 },
    ]);

    const scriptureEnqueue = mockEnqueue.mock.calls.find(call =>
      (call[0] as Array<{ id: string }>).some(
        item => item.id === 'draft-scripture-9',
      ),
    );
    expect(scriptureEnqueue).toBeDefined();
    const scriptureInput = (
      scriptureEnqueue?.[0] as Array<{
        id: string;
        serializedContent?: string;
      }>
    ).find(item => item.id === 'draft-scripture-9');
    expect(scriptureInput?.serializedContent).toContain('In the beginning');
    expect(scriptureInput?.serializedContent).toContain('"verseNumber":1');
    expect(mockWorkerEnqueueAdditional).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: 'draft-scripture-9' }),
      ]),
    );
  });

  it('source failure becomes failed; manual retry succeeds', async () => {
    let manifest = baseManifest();
    mockReadManifest.mockImplementation(async () => manifest);
    mockWriteManifest.mockImplementation(async next => {
      manifest = { ...manifest, ...next };
      return 'file:///manifest.json';
    });
    // Incomplete at start so watcher does not race start's clean manifest write.
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${audioResourceId}`,
        resourceId: audioResourceId,
        status: 'queued',
        kind: 'audio',
        progress: 0,
        userId: 7,
        projectId: 1,
      },
      {
        id: '1-7-draft-text-9',
        resourceId: 'draft-text-9',
        status: 'queued',
        kind: 'text',
        progress: 0,
        userId: 7,
        projectId: 1,
      },
    ]);

    const start = await startDraftDownload(observerRequest);
    expect(start.ok).toBe(true);
    await flush();
    expect(mockGetBibleTexts).not.toHaveBeenCalled();

    mockGetByPrefix.mockResolvedValue(completedAudioAndTextRows());
    mockGetBibleTexts.mockReset();
    mockGetBibleTexts.mockRejectedValue(new Error('bible texts 503'));
    emitDownloadQueueChanged();
    await flush();
    await flush();
    await flush();

    expect(manifest.sourceScriptureError).toContain('bible texts 503');
    const failed = await getDraftDownloadState(observerRequest);
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toContain('bible texts 503');

    mockGetBibleTexts.mockResolvedValue({
      data: [
        {
          bookId: 41,
          chapterNumber: 1,
          verses: [{ id: 1, verseNumber: 1, text: 'Retry verse' }],
        },
      ],
    });
    const scriptureRow = {
      id: '1-7-draft-scripture-9',
      resourceId: 'draft-scripture-9',
      status: 'queued' as const,
      kind: 'text' as const,
      progress: 0,
      userId: 7,
      projectId: 1,
    };
    mockEnqueue.mockImplementation(async (inputs: Array<{ id: string }>) => {
      if (inputs.some(i => i.id === 'draft-scripture-9')) {
        mockGetByPrefix.mockResolvedValue([
          ...completedAudioAndTextRows(),
          scriptureRow,
        ]);
      }
      return inputs.map(i => `1-7-${i.id}`);
    });

    // Manual retry — same tap path as startDraftDownload.
    resetDraftDownloadReadyClocksForTests();
    mockGetByPrefix.mockResolvedValue(completedAudioAndTextRows());
    const retry = await startDraftDownload(observerRequest);
    expect(retry.ok).toBe(true);
    emitDownloadQueueChanged();
    await flush();
    await flush();
    await flush();

    expect(mockGetBibleTexts).toHaveBeenCalled();
    expect(manifest.sourceScriptureError).toBeUndefined();
  });

  it('tombstone after fetch prevents scripture enqueue', async () => {
    let manifest = baseManifest();
    mockReadManifest.mockImplementation(async () => manifest);
    mockWriteManifest.mockImplementation(async next => {
      manifest = { ...manifest, ...next };
      return 'file:///manifest.json';
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${audioResourceId}`,
        resourceId: audioResourceId,
        status: 'queued',
        kind: 'audio',
        progress: 0,
        userId: 7,
        projectId: 1,
      },
      {
        id: '1-7-draft-text-9',
        resourceId: 'draft-text-9',
        status: 'queued',
        kind: 'text',
        progress: 0,
        userId: 7,
        projectId: 1,
      },
    ]);

    let resolveTexts!: (value: unknown) => void;
    let textsCalls = 0;
    mockGetBibleTexts.mockImplementation(
      () =>
        new Promise(resolve => {
          textsCalls += 1;
          resolveTexts = resolve;
        }),
    );

    await startDraftDownload(observerRequest);
    await flush();
    expect(textsCalls).toBe(0);

    mockGetByPrefix.mockResolvedValue(completedAudioAndTextRows());
    emitDownloadQueueChanged();
    await flush();
    expect(textsCalls).toBe(1);

    // Stage-exit purge tombstone while getBibleTexts is in flight.
    manifest = baseManifest({ purged: true, purgeGeneration: 1 });

    resolveTexts({
      data: [
        {
          bookId: 41,
          chapterNumber: 1,
          verses: [{ id: 1, verseNumber: 1, text: 'Should not enqueue' }],
        },
      ],
    });
    await flush();
    await flush();

    const scriptureEnqueue = mockEnqueue.mock.calls.find(call =>
      (call[0] as Array<{ id: string }>).some(
        item => item.id === 'draft-scripture-9',
      ),
    );
    expect(scriptureEnqueue).toBeUndefined();
    expect(mockWorkerEnqueueAdditional).not.toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: 'draft-scripture-9' }),
      ]),
    );
  });

  it('fail-closes scripture path when active account switches mid-fetch', async () => {
    const manifest = baseManifest();
    mockReadManifest.mockImplementation(async () => manifest);
    // Start with incomplete rows so watcher does not fetch during start.
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${audioResourceId}`,
        resourceId: audioResourceId,
        status: 'queued',
        kind: 'audio',
        progress: 0,
        userId: 7,
        projectId: 1,
      },
      {
        id: '1-7-draft-text-9',
        resourceId: 'draft-text-9',
        status: 'queued',
        kind: 'text',
        progress: 0,
        userId: 7,
        projectId: 1,
      },
    ]);

    await startDraftDownload(observerRequest);
    await flush();
    expect(mockGetBibleTexts).not.toHaveBeenCalled();

    mockGetByPrefix.mockResolvedValue(completedAudioAndTextRows());
    mockGetBibleTexts.mockImplementation(async () => {
      mockGetActiveUserId.mockReturnValue('99');
      return {
        data: [
          {
            bookId: 41,
            chapterNumber: 1,
            verses: [{ id: 1, verseNumber: 1, text: 'Stale account' }],
          },
        ],
      };
    });

    emitDownloadQueueChanged();
    await flush();
    await flush();

    const scriptureEnqueue = mockEnqueue.mock.calls.find(call =>
      (call[0] as Array<{ id: string }>).some(
        item => item.id === 'draft-scripture-9',
      ),
    );
    expect(scriptureEnqueue).toBeUndefined();
  });
});

describe('downloadQueueEvents harness sanity', () => {
  it('delivers emit to subscribed listeners', () => {
    const fn = jest.fn();
    const off = onDownloadQueueChanged(fn);
    emitDownloadQueueChanged();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });
});
