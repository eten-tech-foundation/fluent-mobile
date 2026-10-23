const mockGetByPrefix = jest.fn();
const mockReadManifest = jest.fn();
const mockFileExists = jest.fn();
const mockReadString = jest.fn();

jest.mock('../db/downloadQueueRepository', () => ({
  getDownloadQueueItemsByResourcePrefix: (...args: unknown[]) =>
    mockGetByPrefix(...args),
}));

jest.mock('./draftDownloadManifest', () => ({
  readDraftDownloadManifest: (...args: unknown[]) => mockReadManifest(...args),
}));

jest.mock('./downloadStorage', () => ({
  fileExists: (...args: unknown[]) => mockFileExists(...args),
}));

jest.mock('./downloadQueueWorkerSingleton', () => ({
  getSharedDownloadQueueWorker: () => ({
    start: jest.fn(),
    enqueueAdditional: jest.fn(),
    dropItems: jest.fn(),
    getState: () => 'idle',
  }),
}));

jest.mock('../utils/downloadQueueEvents', () => ({
  onDownloadQueueChanged: () => () => undefined,
}));

jest.mock('./connectivity', () => ({
  getTransferTransportSnapshot: jest.fn(),
}));

jest.mock('./userPreferences', () => ({
  getUploadOverCellular: () => false,
}));

jest.mock('./storage', () => ({
  getActiveUserId: () => '7',
}));

jest.mock('./keychain', () => ({
  getCredentials: async () => ({ token: 'session-tok-7' }),
}));

jest.mock('./api', () => ({
  FluentAPI: {
    getChapterVerseAudio: jest.fn(),
    getTranslatedVerses: jest.fn(),
    getBibleTexts: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: (...args: unknown[]) => mockReadString(...args),
}));

import { getDraftChapterLocalBundle } from './draftDownload';
import { draftAudioResourceId } from './draftDownloadIds';

const audioResourceId = draftAudioResourceId(9, 3401, 10, 'abc123hash');

describe('getDraftChapterLocalBundle fail-closed identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileExists.mockResolvedValue(true);
  });

  it('does not invent clean/activeTakeId 0 when manifest is missing', async () => {
    mockReadManifest.mockResolvedValue(null);
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${audioResourceId}`,
        resourceId: audioResourceId,
        status: 'completed',
        kind: 'audio',
        localFilePath: 'file:///a.m4a',
      },
    ]);

    const bundle = await getDraftChapterLocalBundle({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      bibleId: 1,
      bookId: 41,
      chapterNumber: 1,
    });

    expect(bundle.units).toEqual([]);
    expect(bundle.sourceScripture).toBeNull();
  });

  it('preserves real conflict and exposes playback only for manifest units', async () => {
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
        localFilePath: 'file:///a.m4a',
      },
      {
        id: '1-7-draft-text-9',
        resourceId: 'draft-text-9',
        status: 'completed',
        kind: 'text',
        localFilePath: 'file:///t.json',
      },
    ]);
    mockReadString.mockResolvedValue(
      JSON.stringify([
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
      ]),
    );

    const bundle = await getDraftChapterLocalBundle({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      bibleId: 1,
      bookId: 41,
      chapterNumber: 1,
    });

    expect(bundle.hasConflict).toBe(true);
    expect(bundle.units).toEqual([
      expect.objectContaining({
        bibleTextId: 3401,
        conflictStatus: 'conflict',
        activeTakeId: 10,
        contentHash: 'abc123hash',
        coverage: null,
        localPlaybackUri: 'file:///a.m4a',
        draftText: 'Hello',
      }),
    ]);
  });

  it('round-trips non-null pericope coverage from manifest to bundle units', async () => {
    const pericopeResourceId = draftAudioResourceId(
      9,
      3401,
      20,
      'HASH_PERICOPE',
    );
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
          verseNumber: 3,
          conflictStatus: 'conflict',
          activeTakeId: 20,
          contentHash: 'HASH_PERICOPE',
          resourceId: pericopeResourceId,
          coverage: {
            granularity: 'pericope',
            startChapter: 1,
            startVerse: 3,
            endChapter: 2,
            endVerse: 4,
          },
        },
      ],
      purgeGeneration: 0,
      purged: false,
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${pericopeResourceId}`,
        resourceId: pericopeResourceId,
        status: 'completed',
        kind: 'audio',
        localFilePath: 'file:///p.m4a',
      },
      {
        id: '1-7-draft-text-9',
        resourceId: 'draft-text-9',
        status: 'completed',
        kind: 'text',
        localFilePath: 'file:///t.json',
      },
    ]);
    mockReadString.mockResolvedValue(
      JSON.stringify([
        {
          id: 1,
          projectUnitId: 12,
          bibleTextId: 3401,
          assignedUserId: null,
          content: 'Pericope text',
          markers: null,
          verseNumber: 3,
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:00:00.000Z',
        },
      ]),
    );

    const bundle = await getDraftChapterLocalBundle({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      bibleId: 1,
      bookId: 41,
      chapterNumber: 1,
    });

    expect(bundle.units[0]).toMatchObject({
      activeTakeId: 20,
      contentHash: 'HASH_PERICOPE',
      coverage: {
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 3,
        endChapter: 2,
        endVerse: 4,
      },
      localPlaybackUri: 'file:///p.m4a',
    });
  });
});
