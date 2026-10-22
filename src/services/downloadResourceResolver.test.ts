const mockGetChapterVerseAudio = jest.fn();
const mockGetActiveUserId = jest.fn(() => '7');
const mockGetCredentials = jest.fn(async (_userId: string) => ({
  token: 'session-tok-7',
}));

jest.mock('./api', () => ({
  FluentAPI: {
    getChapterVerseAudio: (...args: unknown[]) =>
      mockGetChapterVerseAudio(...args),
  },
}));

jest.mock('./storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
}));

jest.mock('./keychain', () => ({
  getCredentials: (userId: string) => mockGetCredentials(userId),
}));

import { queuedResourceResolver } from './downloadResourceResolver';
import { draftAudioResourceId } from './draftDownloadIds';

describe('queuedResourceResolver draft audio refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveUserId.mockReturnValue('7');
    mockGetCredentials.mockResolvedValue({ token: 'session-tok-7' });
  });

  it('refreshes take.downloadUrl only when activeTakeId+contentHash match', async () => {
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
          activeTakeId: 10,
          takes: [
            {
              id: 10,
              uploadedBy: 3,
              contentType: 'audio/mp4',
              sizeBytes: 2048,
              durationSeconds: 12.5,
              contentHash: 'abc123hash',
              downloadUrl: 'https://example.test/fresh',
              createdAt: '2026-07-15T00:00:00.000Z',
              updatedAt: '2026-07-15T00:00:00.000Z',
            },
          ],
          verseNumber: 1,
          downloadUrl: 'https://example.test/stale-top',
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:00:00.000Z',
        },
      ],
      hasConflict: false,
    });

    const resourceId = draftAudioResourceId(9, 3401, 10, 'abc123hash');
    const result = await queuedResourceResolver({
      id: `1-7-${resourceId}`,
      resourceId,
      tier: 1,
      label: 'Draft audio',
      progress: 0,
      status: 'queued',
      kind: 'audio',
      fileExt: 'm4a',
      serializedContent: JSON.stringify({
        projectUnitId: 12,
        bibleId: 1,
        bookId: 41,
        chapterNumber: 1,
        bibleTextId: 3401,
        expectedActiveTakeId: 10,
        expectedContentHash: 'abc123hash',
      }),
    });

    expect(result).toEqual({
      url: 'https://example.test/fresh',
      ext: 'm4a',
    });
  });

  it('rejects when server active take no longer matches cached identity', async () => {
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
          versionToken: 3,
          conflictStatus: 'clean',
          activeTakeId: 11,
          takes: [
            {
              id: 11,
              uploadedBy: 3,
              contentType: 'audio/mp4',
              sizeBytes: 2048,
              durationSeconds: 12.5,
              contentHash: 'otherhash',
              downloadUrl: 'https://example.test/other',
              createdAt: '2026-07-15T00:00:00.000Z',
              updatedAt: '2026-07-15T00:00:00.000Z',
            },
          ],
          verseNumber: 1,
          downloadUrl: 'https://example.test/top',
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:00:00.000Z',
        },
      ],
      hasConflict: false,
    });

    const resourceId = draftAudioResourceId(9, 3401, 10, 'abc123hash');
    await expect(
      queuedResourceResolver({
        id: `1-7-${resourceId}`,
        resourceId,
        tier: 1,
        label: 'Draft audio',
        progress: 0.5,
        status: 'paused',
        kind: 'audio',
        fileExt: 'm4a',
        serializedContent: JSON.stringify({
          projectUnitId: 12,
          bibleId: 1,
          bookId: 41,
          chapterNumber: 1,
          bibleTextId: 3401,
          expectedActiveTakeId: 10,
          expectedContentHash: 'abc123hash',
        }),
      }),
    ).rejects.toThrow(/activeTakeId/);
  });

  it('passes in-memory session token and fail-closes when account switches', async () => {
    mockGetChapterVerseAudio.mockImplementation(async () => {
      mockGetActiveUserId.mockReturnValue('99');
      return { items: [], hasConflict: false };
    });

    const resourceId = draftAudioResourceId(9, 3401, 10, 'abc123hash');
    await expect(
      queuedResourceResolver({
        id: `1-7-${resourceId}`,
        resourceId,
        userId: 7,
        tier: 1,
        label: 'Draft audio',
        progress: 0,
        status: 'queued',
        kind: 'audio',
        fileExt: 'm4a',
        serializedContent: JSON.stringify({
          projectUnitId: 12,
          bibleId: 1,
          bookId: 41,
          chapterNumber: 1,
          bibleTextId: 3401,
          expectedActiveTakeId: 10,
          expectedContentHash: 'abc123hash',
        }),
      }),
    ).rejects.toThrow(/account changed after list response/);

    expect(mockGetCredentials).toHaveBeenCalledWith('7');
    expect(mockGetChapterVerseAudio).toHaveBeenCalledWith(
      expect.any(Object),
      'session-tok-7',
    );
  });
});
