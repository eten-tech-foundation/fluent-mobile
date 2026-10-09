import { ApiError } from '../types/api/errors';
import { FluentAPI } from './api';
import { syncPericopes } from './sync';
import {
  getPericopeBookVersion,
  setPericopeBookVersion,
  setSyncError,
  clearSyncError,
} from './storage';
import {
  getChaptersNeedingPericopeSync,
  getProjectPericopeSetId,
  upsertPericopeSet,
} from '../db/repository';
import {
  getBundledPericopeSetVersion,
  loadBundledPericopeSet,
} from './pericopeSets';

jest.mock('./api', () => ({
  FluentAPI: {
    getPericopeSet: jest.fn(),
  },
}));

jest.mock('./pericopeSets', () => {
  const actual = jest.requireActual(
    './pericopeSets',
  ) as typeof import('./pericopeSets');
  return {
    ...actual,
    getBundledPericopeSetVersion: jest.fn(),
    loadBundledPericopeSet: jest.fn(),
  };
});

jest.mock('./storage', () => ({
  KV_KEYS: {
    SYNC_ERROR_PERICOPES: 'sync_error_pericopes',
  },
  getPericopeBookVersion: jest.fn(),
  setPericopeBookVersion: jest.fn(),
  setSyncError: jest.fn(),
  clearSyncError: jest.fn(),
  getSyncPausedUntilMs: jest.fn().mockReturnValue(null),
  setSyncPausedUntilMs: jest.fn(),
  clearSyncPausedUntil: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  getChaptersNeedingPericopeSync: jest.fn(),
  getProjectPericopeSetId: jest.fn(),
  upsertPericopeSet: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./connectivity', () => ({
  getConnectivitySnapshot: jest.fn().mockReturnValue({
    isConnected: true,
    isInternetReachable: true,
  }),
}));

describe('syncPericopes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getChaptersNeedingPericopeSync).mockResolvedValue([
      {
        projectId: 10,
        bookId: 41,
        bookCode: 'MRK',
        chapterNumber: 1,
      },
    ]);
    jest.mocked(getProjectPericopeSetId).mockResolvedValue(1);
    jest.mocked(getPericopeBookVersion).mockReturnValue('');
  });

  it('seeds from the bundled asset when the set is bundled', async () => {
    jest.mocked(getBundledPericopeSetVersion).mockReturnValue('bundled-v1');
    jest.mocked(loadBundledPericopeSet).mockReturnValue([
      {
        chapterNumber: 1,
        verseNumber: 1,
        section: 1,
        pericopeNumber: '1',
        pericopeTitle: null,
      },
    ]);

    await syncPericopes();

    expect(upsertPericopeSet).toHaveBeenCalledWith(1, 'MRK', expect.any(Array));
    expect(setPericopeBookVersion).toHaveBeenCalledWith(1, 'MRK', 'bundled-v1');
    expect(FluentAPI.getPericopeSet).not.toHaveBeenCalled();
    expect(clearSyncError).toHaveBeenCalled();
  });

  it('hydrates via GET /pericope-sets/{id} for an unbundled set (200)', async () => {
    jest.mocked(getProjectPericopeSetId).mockResolvedValue(99);
    jest.mocked(getBundledPericopeSetVersion).mockReturnValue(null);
    jest.mocked(FluentAPI.getPericopeSet).mockResolvedValue({
      status: 200,
      etag: '"etag-99"',
      data: [
        {
          bookCode: 'MRK',
          pericopeNumber: '1',
          pericopeTitle: 'Title',
          verses: [{ chapterNumber: 1, verseNumber: 1 }],
        },
      ],
    });

    await syncPericopes();

    expect(FluentAPI.getPericopeSet).toHaveBeenCalledWith(99, {
      bookCode: 'MRK',
      etag: null,
    });
    expect(upsertPericopeSet).toHaveBeenCalledWith(
      99,
      'MRK',
      expect.arrayContaining([
        expect.objectContaining({
          chapterNumber: 1,
          verseNumber: 1,
          pericopeNumber: '1',
        }),
      ]),
    );
    expect(setPericopeBookVersion).toHaveBeenCalledWith(99, 'MRK', '"etag-99"');
  });

  it('skips upsert on 304 and refreshes the stored ETag', async () => {
    jest.mocked(getProjectPericopeSetId).mockResolvedValue(99);
    jest.mocked(getBundledPericopeSetVersion).mockReturnValue(null);
    jest.mocked(getPericopeBookVersion).mockReturnValue('"etag-99"');
    jest.mocked(FluentAPI.getPericopeSet).mockResolvedValue({
      status: 304,
      etag: '"etag-99"',
    });

    await syncPericopes();

    expect(FluentAPI.getPericopeSet).toHaveBeenCalledWith(99, {
      bookCode: 'MRK',
      etag: '"etag-99"',
    });
    expect(upsertPericopeSet).not.toHaveBeenCalled();
    expect(setPericopeBookVersion).toHaveBeenCalledWith(99, 'MRK', '"etag-99"');
  });

  it('does not upsert when the network path fails offline', async () => {
    jest.mocked(getProjectPericopeSetId).mockResolvedValue(99);
    jest.mocked(getBundledPericopeSetVersion).mockReturnValue(null);
    jest
      .mocked(FluentAPI.getPericopeSet)
      .mockRejectedValue(new ApiError(0, 'offline'));

    await expect(syncPericopes()).rejects.toBeInstanceOf(ApiError);
    expect(FluentAPI.getPericopeSet).toHaveBeenCalled();
    expect(upsertPericopeSet).not.toHaveBeenCalled();
    // status 0 is a transient transport failure — sync does not persist KV error
    expect(setSyncError).not.toHaveBeenCalled();
  });
});
