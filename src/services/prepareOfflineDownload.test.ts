const mockEnqueueDownloadItems = jest.fn();
const mockSimulateProgress = jest.fn();

jest.mock('../db/repository', () => ({
  enqueueDownloadItems: (...args: unknown[]) =>
    mockEnqueueDownloadItems(...args),
}));

jest.mock('./prepareOfflineResources', () => ({
  simulatePrepareOfflineDownloadProgress: (...args: unknown[]) =>
    mockSimulateProgress(...args),
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
import type { PrepareOfflineResourceItem } from '../types/prepareOffline/types';

function item(
  overrides: Partial<PrepareOfflineResourceItem> = {},
): PrepareOfflineResourceItem {
  return {
    id: 'tier-1-source-bible-text',
    tier: 1,
    kind: 'text',
    groupName: 'Source Bible',
    label: 'Text',
    bytes: 1024,
    status: 'selected',
    ...overrides,
  };
}

describe('enqueuePrepareOfflineDownload', () => {
  beforeEach(() => {
    mockEnqueueDownloadItems.mockReset();
    mockSimulateProgress.mockReset();
  });

  it('enqueues mapped items and returns queue row ids', async () => {
    mockEnqueueDownloadItems.mockResolvedValue(['tier-1-source-bible-text']);

    const ids = await enqueuePrepareOfflineDownload({
      userId: 7,
      projectId: 5,
      items: [item()],
    });

    expect(mockEnqueueDownloadItems).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'tier-1-source-bible-text',
        projectId: 5,
        userId: 7,
        tier: 1,
        kind: 'text',
        resourceName: 'Source Bible',
        label: 'Text',
      }),
    ]);
    expect(ids).toEqual(['tier-1-source-bible-text']);
    expect(mockSimulateProgress).not.toHaveBeenCalled();
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
    expect(mockSimulateProgress).not.toHaveBeenCalled();
  });

  it('falls back to mock simulation when enqueue throws', async () => {
    mockEnqueueDownloadItems.mockRejectedValue(new Error('db locked'));

    const ids = await enqueuePrepareOfflineDownload({
      userId: 7,
      projectId: 5,
      items: [item(), item({ id: 'tier-2-translation-notes-text', tier: 2 })],
    });

    expect(ids).toEqual([]);
    expect(mockSimulateProgress).toHaveBeenCalledWith(5, [
      'tier-1-source-bible-text',
      'tier-2-translation-notes-text',
    ]);
  });
});
