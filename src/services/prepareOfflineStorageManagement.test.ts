import * as FileSystem from 'expo-file-system/legacy';
import {
  MOCK_FREE_DISK_BYTES,
  MOCK_TOTAL_DISK_BYTES,
  resetFileSystemMock,
} from '../test/mocks/expo-file-system';

const mockGetVerifiedInventory = jest.fn();
const mockGetProjectNamesByIds = jest.fn();
const mockDeleteDownloadItem = jest.fn();

jest.mock('./downloadInventory', () => ({
  getVerifiedDownloadedResourcesInventory: () => mockGetVerifiedInventory(),
}));

jest.mock('../db/queries.prepareOffline', () => ({
  getProjectNamesByIds: (ids: number[]) => mockGetProjectNamesByIds(ids),
}));

jest.mock('../db/repository', () => ({
  deleteDownloadItem: (id: string) => mockDeleteDownloadItem(id),
}));

jest.mock('./storage', () => ({
  getActiveUserId: () => '7',
}));

import {
  deleteSelectedDownloadResources,
  getDeviceStorageSummary,
  getOtherProjectsStorageInventory,
} from './prepareOfflineStorageManagement';

describe('prepareOfflineStorageManagement', () => {
  beforeEach(() => {
    resetFileSystemMock();
    mockGetVerifiedInventory.mockReset();
    mockGetProjectNamesByIds.mockReset();
    mockDeleteDownloadItem.mockReset();
  });

  describe('getDeviceStorageSummary', () => {
    it('returns available device storage and total fluent usage', async () => {
      mockGetVerifiedInventory.mockResolvedValue([
        { projectId: 1, totalBytes: 100, resources: [] },
        { projectId: 2, totalBytes: 250, resources: [] },
      ]);

      const summary = await getDeviceStorageSummary();

      expect(summary).toEqual({
        availableBytes: MOCK_FREE_DISK_BYTES,
        totalDeviceBytes: MOCK_TOTAL_DISK_BYTES,
        fluentUsedBytes: 350,
      });
    });
  });

  describe('getOtherProjectsStorageInventory', () => {
    it('excludes the current project and resolves project names', async () => {
      mockGetVerifiedInventory.mockResolvedValue([
        {
          projectId: 1,
          totalBytes: 100,
          resources: [
            {
              id: 'a',
              projectId: 1,
              label: 'Current project resource',
              resourceName: 'Source Bible',
              kind: 'text',
              bytesTotal: 100,
              localFilePath: 'file:///current.mp3',
              tier: 1,
              progress: 1,
              status: 'completed',
            },
          ],
        },
        {
          projectId: 2,
          totalBytes: 250,
          resources: [
            {
              id: 'b',
              projectId: 2,
              label: 'Translation Notes — Text',
              resourceName: 'Translation Notes',
              kind: 'text',
              bytesTotal: 250,
              localFilePath: 'file:///other.txt',
              tier: 1,
              progress: 1,
              status: 'completed',
            },
          ],
        },
      ]);
      mockGetProjectNamesByIds.mockResolvedValue(new Map([[2, 'Mark']]));

      const groups = await getOtherProjectsStorageInventory(1);

      expect(mockGetProjectNamesByIds).toHaveBeenCalledWith([2]);
      expect(groups).toEqual([
        {
          projectId: 2,
          projectName: 'Mark',
          totalBytes: 250,
          resources: [
            {
              id: 'b',
              projectId: 2,
              label: 'Translation Notes — Text',
              resourceName: 'Translation Notes',
              kind: 'text',
              bytes: 250,
              localFilePath: 'file:///other.txt',
            },
          ],
        },
      ]);
    });

    it('falls back to Project {id} when name is missing', async () => {
      mockGetVerifiedInventory.mockResolvedValue([
        {
          projectId: 9,
          totalBytes: 50,
          resources: [
            {
              id: 'x',
              projectId: 9,
              label: 'Old resource',
              resourceName: 'Old resource',
              kind: 'audio',
              bytesTotal: 50,
              localFilePath: 'file:///old.mp3',
              tier: 1,
              progress: 1,
              status: 'completed',
            },
          ],
        },
      ]);
      mockGetProjectNamesByIds.mockResolvedValue(new Map());

      const groups = await getOtherProjectsStorageInventory(1);

      expect(groups[0]?.projectName).toBe('Project 9');
    });
  });

  describe('deleteSelectedDownloadResources', () => {
    it('deletes files and queue rows for selected other-project resources', async () => {
      const path = `${FileSystem.documentDirectory}downloads/2/b.mp3`;
      await FileSystem.writeAsStringAsync(path, 'audio-bytes');

      const result = await deleteSelectedDownloadResources(
        [
          {
            id: 'b',
            projectId: 2,
            userId: 7,
            label: 'Source Bible — Audio',
            resourceName: 'Source Bible',
            kind: 'audio',
            bytes: 11,
            localFilePath: path,
          },
        ],
        1,
      );

      expect(result).toEqual({ deletedIds: ['b'], failed: [] });
      expect(mockDeleteDownloadItem).toHaveBeenCalledWith('b');
      expect((await FileSystem.getInfoAsync(path)).exists).toBe(false);
    });

    it('does not delete resources from the current project', async () => {
      const result = await deleteSelectedDownloadResources(
        [
          {
            id: 'a',
            projectId: 1,
            userId: 7,
            label: 'Current',
            resourceName: 'Current',
            kind: 'text',
            bytes: 10,
            localFilePath: 'file:///a.mp3',
          },
        ],
        1,
      );

      expect(result.deletedIds).toEqual([]);
      expect(result.failed).toEqual([
        { id: 'a', reason: 'Cannot delete current project' },
      ]);
      expect(mockDeleteDownloadItem).not.toHaveBeenCalled();
    });

    it('deletes queue rows even when local file path is missing', async () => {
      const result = await deleteSelectedDownloadResources(
        [
          {
            id: 'orphan',
            projectId: 2,
            userId: 7,
            label: 'Orphan row',
            resourceName: 'Orphan row',
            kind: 'text',
            bytes: 10,
          },
        ],
        1,
      );

      expect(result).toEqual({ deletedIds: ['orphan'], failed: [] });
      expect(mockDeleteDownloadItem).toHaveBeenCalledWith('orphan');
    });

    it('records failures when queue delete throws without removing the file first', async () => {
      const path = `${FileSystem.documentDirectory}downloads/2/bad.mp3`;
      await FileSystem.writeAsStringAsync(path, 'bytes');
      mockDeleteDownloadItem.mockRejectedValueOnce(new Error('db locked'));

      const result = await deleteSelectedDownloadResources(
        [
          {
            id: 'bad',
            projectId: 2,
            userId: 7,
            label: 'Broken resource',
            resourceName: 'Broken resource',
            kind: 'audio',
            bytes: 10,
            localFilePath: path,
          },
        ],
        1,
      );

      expect(result.deletedIds).toEqual([]);
      expect(result.failed).toEqual([{ id: 'bad', reason: 'db locked' }]);
      expect((await FileSystem.getInfoAsync(path)).exists).toBe(true);
    });

    it('rejects file paths outside the project downloads sandbox', async () => {
      const result = await deleteSelectedDownloadResources(
        [
          {
            id: 'escape',
            projectId: 2,
            userId: 7,
            label: 'Escape',
            resourceName: 'Escape',
            kind: 'text',
            bytes: 10,
            localFilePath: 'file:///etc/passwd',
          },
        ],
        1,
      );

      expect(result.deletedIds).toEqual([]);
      expect(result.failed[0]?.reason).toMatch(/outside the project sandbox/);
      expect(mockDeleteDownloadItem).not.toHaveBeenCalled();
    });

    it('rejects resources not owned by the active account', async () => {
      const path = `${FileSystem.documentDirectory}downloads/2/other.mp3`;
      await FileSystem.writeAsStringAsync(path, 'bytes');

      const result = await deleteSelectedDownloadResources(
        [
          {
            id: 'other-user',
            projectId: 2,
            userId: 99,
            label: 'Other account',
            resourceName: 'Other account',
            kind: 'audio',
            bytes: 10,
            localFilePath: path,
          },
        ],
        1,
      );

      expect(result.deletedIds).toEqual([]);
      expect(result.failed).toEqual([
        { id: 'other-user', reason: 'Not owned by active account' },
      ]);
      expect(mockDeleteDownloadItem).not.toHaveBeenCalled();
    });
  });
});
