const mockEnqueueDownloadItems = jest.fn();

jest.mock('../db/repository', () => ({
  enqueueDownloadItems: (...args: unknown[]) =>
    mockEnqueueDownloadItems(...args),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { enqueuePrepareOfflineDownload } from './prepareOfflineDownload';
import type {
  PrepareOfflineResourceItem,
  PrepareOfflineResourceManifestItem,
} from '../types/prepareOffline/types';

const MEMBER: PrepareOfflineResourceManifestItem = {
  id: 'source-bible-audio-MRK-1',
  tier: 1,
  kind: 'audio',
  resourceName: 'Source Bible',
  label: 'Audio',
  required: true,
  removable: false,
  bytesTotal: 1024,
  sourceUrl: 'https://example.com/audio.mp3',
  fileExt: 'mp3',
  languageCode: 'eng',
  bookCode: 'MRK',
  startChapter: 1,
  endChapter: 1,
};

function item(
  overrides: Partial<PrepareOfflineResourceItem> = {},
  members: PrepareOfflineResourceManifestItem[] = [MEMBER],
): PrepareOfflineResourceItem {
  return {
    id: 'Source Bible:audio',
    tier: 1,
    kind: 'audio',
    groupName: 'Source Bible',
    label: 'Audio',
    bytes: 1024,
    status: 'selected',
    required: true,
    removable: false,
    manifestMembers: members,
    ...overrides,
  };
}

describe('enqueuePrepareOfflineDownload', () => {
  beforeEach(() => {
    mockEnqueueDownloadItems.mockReset();
  });

  it('enqueues one real row per manifest member and returns queue row ids', async () => {
    mockEnqueueDownloadItems.mockResolvedValue(['source-bible-audio-MRK-1']);

    const ids = await enqueuePrepareOfflineDownload({
      userId: 7,
      projectId: 5,
      items: [item()],
    });

    expect(mockEnqueueDownloadItems).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'source-bible-audio-MRK-1',
        projectId: 5,
        userId: 7,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Audio',
        sourceUrl: 'https://example.com/audio.mp3',
        fileExt: 'mp3',
        bytesTotal: 1024,
      }),
    ]);
    expect(ids).toEqual(['source-bible-audio-MRK-1']);
  });

  it('returns an empty array when no items are selected', async () => {
    mockEnqueueDownloadItems.mockResolvedValue([]);

    const ids = await enqueuePrepareOfflineDownload({
      userId: 7,
      projectId: 5,
      items: [],
    });

    expect(ids).toEqual([]);
    expect(mockEnqueueDownloadItems).toHaveBeenCalledWith([]);
  });

  it('surfaces enqueue failures to the caller (no fake downloads)', async () => {
    mockEnqueueDownloadItems.mockRejectedValue(new Error('db locked'));

    await expect(
      enqueuePrepareOfflineDownload({
        userId: 7,
        projectId: 5,
        items: [item(), item({ id: 'Translation Words:text', tier: 2 })],
      }),
    ).rejects.toThrow('db locked');
    expect(mockEnqueueDownloadItems).toHaveBeenCalledTimes(1);
  });
});
