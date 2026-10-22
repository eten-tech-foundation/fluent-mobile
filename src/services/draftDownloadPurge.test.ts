const mockGetByPrefix = jest.fn();
const mockDeleteItem = jest.fn();
const mockDeleteFile = jest.fn();
const mockMarkCancelled = jest.fn();
const mockReadManifest = jest.fn();
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
  readDraftDownloadManifest: (...args: unknown[]) => mockReadManifest(...args),
  writeDraftDownloadPurgeTombstone: (...args: unknown[]) =>
    mockWriteTombstone(...args),
}));

jest.mock('./downloadQueueWorkerSingleton', () => ({
  getSharedDownloadQueueWorker: () => ({
    dropItems: (...args: unknown[]) => mockDropItems(...args),
  }),
}));

import { purgeDraftDownloadsOnStageExit } from './draftDownloadPurge';

describe('purgeDraftDownloadsOnStageExit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadManifest.mockResolvedValue({
      chapterAssignmentId: 9,
      projectId: 1,
      userId: 7,
      role: 'peer_check',
      purgeGeneration: 0,
      purged: false,
      units: [],
    });
    mockWriteTombstone.mockResolvedValue(undefined);
    mockDropItems.mockResolvedValue(undefined);
    mockGetByPrefix.mockResolvedValue([
      {
        id: '1-7-draft-audio-9-3401-t10-abc',
        resourceId: 'draft-audio-9-3401-t10-abc',
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/draft.m4a',
      },
      {
        id: '1-7-source-bible-audio-MRK-1',
        resourceId: 'source-bible-audio-MRK-1',
        projectId: 1,
        localFilePath: 'file:///docs/downloads/1/source.mp3',
      },
    ]);
    mockDeleteItem.mockResolvedValue(undefined);
    mockDeleteFile.mockResolvedValue(undefined);
  });

  it('tombstones then drops worker items before deleting draft files only', async () => {
    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'peer_check',
    });

    expect(mockWriteTombstone).toHaveBeenCalled();
    expect(mockDropItems).toHaveBeenCalledWith([
      '1-7-draft-audio-9-3401-t10-abc',
    ]);
    expect(result.deletedCount).toBe(1);
    expect(mockDeleteFile).toHaveBeenCalledWith(
      1,
      'file:///docs/downloads/1/draft.m4a',
    );
    expect(mockDeleteItem).not.toHaveBeenCalledWith(
      '1-7-source-bible-audio-MRK-1',
    );
  });

  it('retains queue row when file delete fails', async () => {
    mockDeleteFile.mockRejectedValue(new Error('EPERM'));
    const result = await purgeDraftDownloadsOnStageExit({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check',
      leftStage: 'community_review',
    });
    expect(result.failedIds).toEqual(['1-7-draft-audio-9-3401-t10-abc']);
    expect(mockDeleteItem).not.toHaveBeenCalled();
    expect(mockMarkCancelled).toHaveBeenCalled();
  });
});
