import * as FileSystem from 'expo-file-system/legacy';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';

const mockGetDownloadedResourcesInventory = jest.fn();

jest.mock('./storage', () => ({
  getActiveUserId: () => '42',
}));

jest.mock('../db/repository', () => ({
  getDownloadedResourcesInventory: (userId: number) =>
    mockGetDownloadedResourcesInventory(userId),
}));

import { getVerifiedDownloadedResourcesInventory } from './downloadInventory';

describe('downloadInventory', () => {
  beforeEach(() => {
    resetFileSystemMock();
    mockGetDownloadedResourcesInventory.mockReset();
  });

  it('groups only files that still exist and refreshes sizes from storage', async () => {
    const existingPath = `${FileSystem.documentDirectory}downloads/1/a.mp3`;
    const missingPath = `${FileSystem.documentDirectory}downloads/1/missing.mp3`;
    await FileSystem.writeAsStringAsync(existingPath, 'fresh-bytes');
    mockGetDownloadedResourcesInventory.mockResolvedValue([
      {
        projectId: 1,
        totalBytes: 999,
        resources: [
          {
            id: 'a',
            tier: 1,
            label: 'Source Bible',
            progress: 1,
            status: 'completed',
            projectId: 1,
            localFilePath: existingPath,
            bytesTotal: 999,
          },
          {
            id: 'missing',
            tier: 1,
            label: 'Missing',
            progress: 1,
            status: 'completed',
            projectId: 1,
            localFilePath: missingPath,
            bytesTotal: 50,
          },
        ],
      },
    ]);

    const inventory = await getVerifiedDownloadedResourcesInventory();

    expect(mockGetDownloadedResourcesInventory).toHaveBeenCalledWith(42);
    expect(inventory).toEqual([
      {
        projectId: 1,
        totalBytes: 'fresh-bytes'.length,
        resources: [
          expect.objectContaining({
            id: 'a',
            bytesTotal: 'fresh-bytes'.length,
          }),
        ],
      },
    ]);
  });
});
