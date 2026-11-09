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
import {
  DRAFT_LISTING_SNAPSHOT_TTL_MS,
  clearDraftListingSnapshots,
  seedDraftListingSnapshot,
} from './draftListingSnapshot';
import type { DownloadQueueItem } from '../types/download/types';
import type { VerseAudioListResponse } from '../types/api/verseAudio';

/** Chapter listing with one unit whose active take is `takeId`/`hash`. */
function listingWith(
  units: Array<{
    bibleTextId: number;
    takeId: number;
    hash: string;
    url: string;
  }>,
): VerseAudioListResponse {
  return {
    items: units.map(unit => ({
      id: unit.bibleTextId,
      projectUnitId: 12,
      bibleTextId: unit.bibleTextId,
      uploadedBy: 3,
      contentType: 'audio/mp4',
      sizeBytes: 4096,
      durationSeconds: 12.5,
      versionToken: 2,
      conflictStatus: 'clean' as const,
      activeTakeId: unit.takeId,
      takes: [
        {
          id: unit.takeId,
          uploadedBy: 3,
          contentType: 'audio/mp4',
          sizeBytes: 2048,
          durationSeconds: 12.5,
          contentHash: unit.hash,
          downloadUrl: unit.url,
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:00:00.000Z',
        },
      ],
      verseNumber: 1,
      downloadUrl: 'https://example.test/stale-top',
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    })),
    hasConflict: false,
  };
}

function draftItem(input: {
  userId?: number;
  bibleTextId: number;
  takeId: number;
  hash: string;
  chapterNumber?: number;
}): DownloadQueueItem {
  const resourceId = draftAudioResourceId(
    9,
    input.bibleTextId,
    input.takeId,
    input.hash,
  );
  return {
    id: `1-${input.userId ?? 0}-${resourceId}`,
    resourceId,
    userId: input.userId,
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
      chapterNumber: input.chapterNumber ?? 1,
      bibleTextId: input.bibleTextId,
      expectedActiveTakeId: input.takeId,
      expectedContentHash: input.hash,
    }),
  };
}

const CHAPTER = { projectUnitId: 12, bibleId: 1, bookId: 41, chapterNumber: 1 };

describe('queuedResourceResolver draft audio refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDraftListingSnapshots();
    mockGetActiveUserId.mockReturnValue('7');
    mockGetCredentials.mockResolvedValue({ token: 'session-tok-7' });
  });

  it('bypasses a still-fresh signed URL snapshot after the worker rejects its response', async () => {
    seedDraftListingSnapshot(
      CHAPTER,
      '7',
      listingWith([
        {
          bibleTextId: 3401,
          takeId: 10,
          hash: 'same',
          url: 'https://example.test/expired',
        },
      ]),
    );
    mockGetChapterVerseAudio.mockResolvedValue(
      listingWith([
        {
          bibleTextId: 3401,
          takeId: 10,
          hash: 'same',
          url: 'https://example.test/fresh',
        },
      ]),
    );
    const item = draftItem({
      userId: 7,
      bibleTextId: 3401,
      takeId: 10,
      hash: 'same',
    });
    expect(await queuedResourceResolver(item)).toMatchObject({
      url: 'https://example.test/expired',
    });
    expect(
      await queuedResourceResolver(item, { forceRefresh: true }),
    ).toMatchObject({ url: 'https://example.test/fresh' });
    expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
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
      undefined,
    );
  });

  it('forwards the worker abort signal to the listing request (#886)', async () => {
    mockGetChapterVerseAudio.mockResolvedValue({
      items: [],
      hasConflict: false,
    });
    const controller = new AbortController();
    const resourceId = draftAudioResourceId(9, 3401, 10, 'abc123hash');

    await expect(
      queuedResourceResolver(
        {
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
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow(/not in chapter listing/);

    expect(mockGetChapterVerseAudio).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      { signal: controller.signal },
    );
  });

  describe('chapter listing snapshot (#886)', () => {
    const three = [
      { bibleTextId: 3401, takeId: 10, hash: 'h1', url: 'https://s3/1' },
      { bibleTextId: 3402, takeId: 20, hash: 'h2', url: 'https://s3/2' },
      { bibleTextId: 3403, takeId: 30, hash: 'h3', url: 'https://s3/3' },
    ];

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('serves N files of one chapter from a single listing', async () => {
      mockGetChapterVerseAudio.mockResolvedValue(listingWith(three));

      const urls = [];
      for (const unit of three) {
        const { url } = await queuedResourceResolver(
          draftItem({ userId: 7, ...unit }),
        );
        urls.push(url);
      }

      expect(urls).toEqual(['https://s3/1', 'https://s3/2', 'https://s3/3']);
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
    });

    it('uses the manifest-seeded listing without any network listing', async () => {
      seedDraftListingSnapshot(CHAPTER, '7', listingWith(three));

      const { url } = await queuedResourceResolver(
        draftItem({ userId: 7, ...three[1] }),
      );

      expect(url).toBe('https://s3/2');
      expect(mockGetChapterVerseAudio).not.toHaveBeenCalled();
    });

    it('re-lists after the TTL expires', async () => {
      const start = 1_700_000_000_000;
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(start);
      mockGetChapterVerseAudio.mockResolvedValue(listingWith(three));

      await queuedResourceResolver(draftItem({ userId: 7, ...three[0] }));
      nowSpy.mockReturnValue(start + DRAFT_LISTING_SNAPSHOT_TTL_MS - 1);
      await queuedResourceResolver(draftItem({ userId: 7, ...three[1] }));
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(start + DRAFT_LISTING_SNAPSHOT_TTL_MS);
      await queuedResourceResolver(draftItem({ userId: 7, ...three[2] }));
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(2);
    });

    it("never serves one account from another account's snapshot", async () => {
      seedDraftListingSnapshot(CHAPTER, '7', listingWith(three));
      mockGetActiveUserId.mockReturnValue('8');
      mockGetCredentials.mockResolvedValue({ token: 'session-tok-8' });
      mockGetChapterVerseAudio.mockResolvedValue(
        listingWith([
          { bibleTextId: 3401, takeId: 10, hash: 'h1', url: 'https://s3/u8' },
        ]),
      );

      const { url } = await queuedResourceResolver(
        draftItem({ userId: 8, ...three[0] }),
      );

      expect(url).toBe('https://s3/u8');
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
      expect(mockGetChapterVerseAudio).toHaveBeenCalledWith(
        expect.any(Object),
        'session-tok-8',
        undefined,
      );
    });

    it('still fail-closes when the active account is not the item owner, even with a snapshot', async () => {
      seedDraftListingSnapshot(CHAPTER, '7', listingWith(three));
      mockGetActiveUserId.mockReturnValue('8');

      await expect(
        queuedResourceResolver(draftItem({ userId: 7, ...three[0] })),
      ).rejects.toThrow(/active account != item userId 7/);
      expect(mockGetChapterVerseAudio).not.toHaveBeenCalled();
    });

    it('revalidates once when the snapshot disagrees with the item, then resolves the new take', async () => {
      // Snapshot predates a re-record: it still lists take 10 for 3401.
      seedDraftListingSnapshot(CHAPTER, '7', listingWith(three));
      // Server now has take 11; the item was queued from a newer manifest.
      mockGetChapterVerseAudio.mockResolvedValue(
        listingWith([
          { bibleTextId: 3401, takeId: 11, hash: 'h1b', url: 'https://s3/1b' },
          three[1],
          three[2],
        ]),
      );

      const { url } = await queuedResourceResolver(
        draftItem({ userId: 7, bibleTextId: 3401, takeId: 11, hash: 'h1b' }),
      );

      expect(url).toBe('https://s3/1b');
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
      // The fresh listing replaced the snapshot: the next file is served
      // from it, not from another request.
      await queuedResourceResolver(draftItem({ userId: 7, ...three[1] }));
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
    });

    it('revalidates once when the snapshot unit has no resolvable active take', async () => {
      const stale = listingWith(three);
      stale.items[0] = { ...stale.items[0], activeTakeId: null };
      seedDraftListingSnapshot(CHAPTER, '7', stale);
      mockGetChapterVerseAudio.mockResolvedValue(listingWith(three));

      const { url } = await queuedResourceResolver(
        draftItem({ userId: 7, ...three[0] }),
      );

      expect(url).toBe('https://s3/1');
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
    });

    it('fails the item after exactly one revalidation when the server disagrees too', async () => {
      seedDraftListingSnapshot(CHAPTER, '7', listingWith(three));
      mockGetChapterVerseAudio.mockResolvedValue(listingWith(three));

      await expect(
        queuedResourceResolver(
          draftItem({ userId: 7, bibleTextId: 3401, takeId: 11, hash: 'h1b' }),
        ),
      ).rejects.toThrow(/activeTakeId 10 != expected 11/);
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
    });

    it('does not revalidate a listing that was just fetched from the network', async () => {
      mockGetChapterVerseAudio.mockResolvedValue(listingWith(three));

      await expect(
        queuedResourceResolver(
          draftItem({ userId: 7, bibleTextId: 3401, takeId: 11, hash: 'h1b' }),
        ),
      ).rejects.toThrow(/activeTakeId 10 != expected 11/);
      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(1);
    });

    it('items without a userId never use the snapshot', async () => {
      seedDraftListingSnapshot(CHAPTER, '7', listingWith(three));
      mockGetChapterVerseAudio.mockResolvedValue(listingWith(three));

      await queuedResourceResolver(draftItem({ ...three[0] }));
      await queuedResourceResolver(draftItem({ ...three[1] }));

      expect(mockGetChapterVerseAudio).toHaveBeenCalledTimes(2);
    });
  });
});
