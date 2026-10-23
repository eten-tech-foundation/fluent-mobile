const mockGetByPrefix = jest.fn();
const mockDeleteItem = jest.fn();
const mockDeleteFile = jest.fn();
const mockMarkCancelled = jest.fn();
const mockReadManifest = jest.fn();
const mockManifestExists = jest.fn();
const mockWriteTombstone = jest.fn();
const mockDropItems = jest.fn();

jest.mock('../db/downloadQueueRepository', () => ({
  getDownloadQueueItemsByResourcePrefix: (...args: unknown[]) =>
    mockGetByPrefix(...args),
  deleteDownloadItem: (...args: unknown[]) => mockDeleteItem(...args),
  markDownloadItemCancelled: (...args: unknown[]) => mockMarkCancelled(...args),
}));

jest.mock('./downloadStorage', () => ({
  deleteDownloadResourceFile: (...args: unknown[]) => mockDeleteFile(...args),
}));

jest.mock('./draftDownloadManifest', () => ({
  draftDownloadManifestExists: (...args: unknown[]) =>
    mockManifestExists(...args),
  readDraftDownloadManifest: (...args: unknown[]) => mockReadManifest(...args),
  writeDraftDownloadPurgeTombstone: (...args: unknown[]) =>
    mockWriteTombstone(...args),
}));

jest.mock('./downloadQueueWorkerSingleton', () => ({
  getSharedDownloadQueueWorker: () => ({
    dropItems: (...args: unknown[]) => mockDropItems(...args),
  }),
}));

import {
  isStrictlyForwardStageExit,
  maybePurgeDraftDownloadsAfterPersistedStageChange,
  purgeDraftDownloadsOnStageExit,
  roleForStageExit,
} from './draftDownloadPurge';

const AUDIO_ID = 'draft-audio-9-3401-t10-abc';
const TEXT_ID = 'draft-text-9';
const SCRIPTURE_ID = 'draft-scripture-9';
const SHARED_AUDIO = 'draft-audio-9-3401-t10-shared';

function peerManifest(overrides: Record<string, unknown> = {}) {
  return {
    chapterAssignmentId: 9,
    projectId: 1,
    userId: 7,
    role: 'peer_check' as const,
    projectUnitId: 12,
    bibleId: 1,
    bookId: 41,
    bookCode: 'MRK',
    chapterNumber: 1,
    purgeGeneration: 0,
    purged: false,
    units: [
      {
        bibleTextId: 3401,
        verseNumber: 1,
        conflictStatus: 'clean',
        activeTakeId: 10,
        contentHash: 'abc',
        resourceId: AUDIO_ID,
        coverage: null,
      },
    ],
    ...overrides,
  };
}

function observerManifest(overrides: Record<string, unknown> = {}) {
  return peerManifest({
    role: 'observer',
    units: [
      {
        bibleTextId: 3401,
        verseNumber: 1,
        conflictStatus: 'clean',
        activeTakeId: 10,
        contentHash: 'shared',
        resourceId: SHARED_AUDIO,
        coverage: null,
      },
    ],
    ...overrides,
  });
}

describe('purgeDraftDownloadsOnStageExit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManifestExists.mockResolvedValue(false);
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'peer_check') return peerManifest();
      return null;
    });
    mockWriteTombstone.mockResolvedValue(undefined);
    mockDropItems.mockResolvedValue(undefined);
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${AUDIO_ID}`,
        resourceId: AUDIO_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/draft.m4a',
      },
      {
        id: `1-7-${TEXT_ID}`,
        resourceId: TEXT_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/draft.txt',
      },
      {
        id: '1-7-source-bible-audio-MRK-1',
        resourceId: 'source-bible-audio-MRK-1',
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/source.mp3',
      },
      {
        id: '1-7-recording-authored',
        resourceId: 'recording-9-1',
        projectId: 1,
        localFilePath: 'file:///docs/recordings/1.m4a',
      },
    ]);
    mockDeleteItem.mockResolvedValue(undefined);
    mockDeleteFile.mockResolvedValue(undefined);
  });

  it('tombstones then drops worker items before deleting owned draft files only', async () => {
    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });

    expect(mockWriteTombstone).toHaveBeenCalled();
    expect(mockDropItems).toHaveBeenCalledWith([
      `1-7-${AUDIO_ID}`,
      `1-7-${TEXT_ID}`,
    ]);
    expect(result.deletedCount).toBe(2);
    expect(mockDeleteFile).toHaveBeenCalledWith(
      1,
      'file:///docs/downloads/1/draft.m4a',
    );
    expect(mockDeleteItem).not.toHaveBeenCalledWith(
      '1-7-source-bible-audio-MRK-1',
    );
    expect(mockDeleteItem).not.toHaveBeenCalledWith('1-7-recording-authored');
  });

  it('retains queue row when file delete fails (retryable)', async () => {
    mockDeleteFile.mockRejectedValue(new Error('EPERM'));
    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });
    expect(result.failedIds).toEqual([`1-7-${AUDIO_ID}`, `1-7-${TEXT_ID}`]);
    expect(mockDeleteItem).not.toHaveBeenCalled();
    expect(mockMarkCancelled).toHaveBeenCalled();
  });

  it('retries deletes from a prior tombstone that preserved units', async () => {
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'peer_check') {
        return peerManifest({ purged: true, purgeGeneration: 1 });
      }
      return null;
    });

    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });

    expect(mockWriteTombstone).toHaveBeenCalled();
    expect(result.deletedCount).toBe(2);
  });

  it('fails safe on missing own manifest: empty tombstone only, no deletes', async () => {
    mockReadManifest.mockResolvedValue(null);
    mockManifestExists.mockResolvedValue(false);
    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });
    expect(mockWriteTombstone).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'peer_check' }),
      null,
    );
    expect(mockGetByPrefix).not.toHaveBeenCalled();
    expect(mockDropItems).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 0, failedIds: [] });
  });

  it('skips tombstone when own manifest file exists but fails read/validate', async () => {
    mockReadManifest.mockResolvedValue(null);
    mockManifestExists.mockResolvedValue(true);
    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });
    expect(mockWriteTombstone).not.toHaveBeenCalled();
    expect(mockGetByPrefix).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 0, failedIds: [] });
  });

  it('no-ops on role/stage mismatch without tombstoning', async () => {
    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'community_review',
    });
    expect(result).toEqual({ deletedCount: 0, failedIds: [] });
    expect(mockWriteTombstone).not.toHaveBeenCalled();
    expect(mockReadManifest).not.toHaveBeenCalled();
  });

  it('observer exits community_review and deletes scripture + owned audio/text', async () => {
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'observer') return observerManifest();
      return null;
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${SHARED_AUDIO}`,
        resourceId: SHARED_AUDIO,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/obs.m4a',
      },
      {
        id: `1-7-${TEXT_ID}`,
        resourceId: TEXT_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/draft.txt',
      },
      {
        id: `1-7-${SCRIPTURE_ID}`,
        resourceId: SCRIPTURE_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/scripture.json',
      },
    ]);

    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'observer',
      leftStage: 'community_review',
    });

    expect(result.deletedCount).toBe(3);
    expect(mockDropItems).toHaveBeenCalledWith([
      `1-7-${SHARED_AUDIO}`,
      `1-7-${TEXT_ID}`,
      `1-7-${SCRIPTURE_ID}`,
    ]);
  });

  it('protects resources still referenced by a valid active sibling manifest', async () => {
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'peer_check') {
        return peerManifest({
          units: [
            {
              bibleTextId: 3401,
              verseNumber: 1,
              conflictStatus: 'clean',
              activeTakeId: 10,
              contentHash: 'abc',
              resourceId: AUDIO_ID,
              coverage: null,
            },
            {
              bibleTextId: 3401,
              verseNumber: 2,
              conflictStatus: 'clean',
              activeTakeId: 10,
              contentHash: 'shared',
              resourceId: SHARED_AUDIO,
              coverage: null,
            },
          ],
        });
      }
      return observerManifest({ purged: false });
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${SHARED_AUDIO}`,
        resourceId: SHARED_AUDIO,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/shared.m4a',
      },
      {
        id: `1-7-${TEXT_ID}`,
        resourceId: TEXT_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/draft.txt',
      },
      {
        id: `1-7-${AUDIO_ID}`,
        resourceId: AUDIO_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/peer-only.m4a',
      },
    ]);

    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });

    // Sibling observer still references SHARED_AUDIO + TEXT; peer-only AUDIO goes.
    expect(mockDropItems).toHaveBeenCalledWith([`1-7-${AUDIO_ID}`]);
    expect(result.deletedCount).toBe(1);
  });

  it('does not protect against a purged sibling tombstone', async () => {
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'peer_check') {
        return peerManifest({
          units: [
            {
              bibleTextId: 3401,
              verseNumber: 1,
              conflictStatus: 'clean',
              activeTakeId: 10,
              contentHash: 'shared',
              resourceId: SHARED_AUDIO,
              coverage: null,
            },
          ],
        });
      }
      return observerManifest({ purged: true, purgeGeneration: 2 });
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${SHARED_AUDIO}`,
        resourceId: SHARED_AUDIO,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/shared.m4a',
      },
      {
        id: `1-7-${TEXT_ID}`,
        resourceId: TEXT_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/draft.txt',
      },
    ]);

    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });

    expect(result.deletedCount).toBe(2);
  });

  it('never purges forged draft-audio for another assignment (fail safe)', async () => {
    const forged = 'draft-audio-999-3401-t10-abc';
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'peer_check') {
        return peerManifest({
          units: [
            {
              bibleTextId: 3401,
              verseNumber: 1,
              conflictStatus: 'clean',
              activeTakeId: 10,
              contentHash: 'abc',
              resourceId: forged,
              coverage: null,
            },
          ],
        });
      }
      return null;
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${forged}`,
        resourceId: forged,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/forged.m4a',
      },
      {
        id: `1-7-${TEXT_ID}`,
        resourceId: TEXT_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/draft.txt',
      },
      {
        id: '1-7-source-bible-audio-MRK-1',
        resourceId: 'source-bible-audio-MRK-1',
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/source.mp3',
      },
    ]);

    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });

    expect(mockWriteTombstone).toHaveBeenCalled();
    expect(mockDropItems).not.toHaveBeenCalled();
    expect(mockDeleteItem).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 0, failedIds: [] });
  });

  it('both roles eventually clean shared resources while preserving active sibling then retry', async () => {
    let observerPurged = false;
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'peer_check') {
        return peerManifest({
          units: [
            {
              bibleTextId: 3401,
              verseNumber: 1,
              conflictStatus: 'clean',
              activeTakeId: 10,
              contentHash: 'shared',
              resourceId: SHARED_AUDIO,
              coverage: null,
            },
          ],
          purged: false,
        });
      }
      return observerManifest({
        purged: observerPurged,
        purgeGeneration: observerPurged ? 1 : 0,
      });
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${SHARED_AUDIO}`,
        resourceId: SHARED_AUDIO,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/shared.m4a',
      },
      {
        id: `1-7-${TEXT_ID}`,
        resourceId: TEXT_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/draft.txt',
      },
    ]);

    const peerFirst = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });
    // Active observer sibling still references shared audio + text.
    expect(peerFirst.deletedCount).toBe(0);
    expect(mockDropItems).toHaveBeenCalledWith([]);

    observerPurged = true;
    mockDropItems.mockClear();
    mockDeleteItem.mockClear();
    mockDeleteFile.mockClear();
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'observer') {
        return observerManifest({ purged: false });
      }
      // Peer already tombstoned — no longer protects.
      return peerManifest({
        units: [
          {
            bibleTextId: 3401,
            verseNumber: 1,
            conflictStatus: 'clean',
            activeTakeId: 10,
            contentHash: 'shared',
            resourceId: SHARED_AUDIO,
            coverage: null,
          },
        ],
        purged: true,
        purgeGeneration: 1,
      });
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${SHARED_AUDIO}`,
        resourceId: SHARED_AUDIO,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/shared.m4a',
      },
      {
        id: `1-7-${TEXT_ID}`,
        resourceId: TEXT_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/draft.txt',
      },
      {
        id: `1-7-${SCRIPTURE_ID}`,
        resourceId: SCRIPTURE_ID,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/scripture.json',
      },
    ]);

    const observerSecond = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'observer',
      leftStage: 'community_review',
    });
    expect(observerSecond.deletedCount).toBe(3);

    // Retry semantics: file delete failure retains the queue row.
    mockDeleteFile.mockRejectedValueOnce(new Error('EPERM'));
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'observer') {
        return observerManifest({ purged: true, purgeGeneration: 1 });
      }
      return null;
    });
    mockGetByPrefix.mockResolvedValue([
      {
        id: `1-7-${SHARED_AUDIO}`,
        resourceId: SHARED_AUDIO,
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/shared.m4a',
      },
    ]);
    const retry = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'observer',
      leftStage: 'community_review',
    });
    expect(retry.failedIds).toEqual([`1-7-${SHARED_AUDIO}`]);
    expect(mockMarkCancelled).toHaveBeenCalled();
  });

  it('scopes queue reads to the actor account (projectId + userId)', async () => {
    await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });
    expect(mockGetByPrefix).toHaveBeenCalledWith(1, 7, 'draft-');
  });

  it('drops in-flight worker targets before file deletes (resolving-worker race)', async () => {
    const order: string[] = [];
    mockWriteTombstone.mockImplementation(async () => {
      order.push('tombstone');
    });
    mockDropItems.mockImplementation(async () => {
      order.push('drop');
    });
    mockDeleteFile.mockImplementation(async () => {
      order.push('deleteFile');
    });

    await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });

    expect(order.indexOf('tombstone')).toBeLessThan(order.indexOf('drop'));
    expect(order.indexOf('drop')).toBeLessThan(order.indexOf('deleteFile'));
  });
});

describe('persisted-stage purge gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadManifest.mockResolvedValue(peerManifest());
    mockWriteTombstone.mockResolvedValue(undefined);
    mockDropItems.mockResolvedValue(undefined);
    mockGetByPrefix.mockResolvedValue([]);
    mockDeleteItem.mockResolvedValue(undefined);
    mockDeleteFile.mockResolvedValue(undefined);
  });

  it('maps left stages to roles', () => {
    expect(roleForStageExit('peer_check')).toBe('peer_check');
    expect(roleForStageExit('community_review')).toBe('observer');
    expect(roleForStageExit('draft')).toBeNull();
    expect(roleForStageExit(null)).toBeNull();
  });

  it('detects strictly forward exits only', () => {
    expect(isStrictlyForwardStageExit('peer_check', 'community_review')).toBe(
      true,
    );
    expect(
      isStrictlyForwardStageExit('community_review', 'linguist_check'),
    ).toBe(true);
    expect(isStrictlyForwardStageExit('peer_check', 'peer_check')).toBe(false);
    expect(isStrictlyForwardStageExit('community_review', 'peer_check')).toBe(
      false,
    );
    expect(isStrictlyForwardStageExit('peer_check', 'mystery')).toBe(false);
    expect(isStrictlyForwardStageExit(null, 'community_review')).toBe(false);
    expect(isStrictlyForwardStageExit('peer_check', undefined)).toBe(false);
  });

  it('purges peer_check role on forward exit of peer_check', async () => {
    await maybePurgeDraftDownloadsAfterPersistedStageChange({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      fromStatus: 'peer_check',
      toStatus: 'community_review',
    });
    expect(mockWriteTombstone).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'peer_check' }),
      expect.anything(),
    );
  });

  it('purges observer role on forward exit of community_review', async () => {
    mockReadManifest.mockResolvedValue(observerManifest());
    await maybePurgeDraftDownloadsAfterPersistedStageChange({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      fromStatus: 'community_review',
      toStatus: 'linguist_check',
    });
    expect(mockWriteTombstone).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'observer' }),
      expect.anything(),
    );
  });

  it.each([
    ['same', 'peer_check', 'peer_check'],
    ['lower', 'community_review', 'peer_check'],
    ['unknown to', 'peer_check', 'not_a_stage'],
    ['missing from', null, 'community_review'],
    ['missing to', 'peer_check', null],
    ['non-cleanup stage exit', 'draft', 'peer_check'],
  ] as const)(
    'skips purge for %s persisted transition',
    async (_label, fromStatus, toStatus) => {
      const result = await maybePurgeDraftDownloadsAfterPersistedStageChange({
        projectId: 1,
        userId: 7,
        chapterAssignmentId: 9,
        fromStatus,
        toStatus,
      });
      expect(result).toBeNull();
      expect(mockWriteTombstone).not.toHaveBeenCalled();
    },
  );

  it('retries purge when same-stage write finds purged manifest still listing units', async () => {
    mockReadManifest.mockImplementation(async (identity: { role: string }) => {
      if (identity.role === 'peer_check') {
        return peerManifest({ purged: true, purgeGeneration: 1 });
      }
      return null;
    });
    const result = await maybePurgeDraftDownloadsAfterPersistedStageChange({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      fromStatus: 'peer_check',
      toStatus: 'peer_check',
    });
    expect(result).not.toBeNull();
    expect(mockWriteTombstone).toHaveBeenCalled();
    expect(mockDropItems).toHaveBeenCalled();
  });
});
