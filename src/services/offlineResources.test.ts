import * as FileSystem from 'expo-file-system/legacy';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import { findDownloadedRows, readDownloadedJson } from './offlineResources';
import { getDownloadedResourcesForChapter } from '../db/downloadQueueRepository';
import type { DownloadQueueItem } from '../types/download/types';

jest.mock('../db/downloadQueueRepository', () => ({
  getDownloadedResourcesForChapter: jest.fn(),
}));

const mockGetRows = getDownloadedResourcesForChapter as jest.MockedFunction<
  typeof getDownloadedResourcesForChapter
>;

function queueRow(
  overrides: Partial<DownloadQueueItem> = {},
): DownloadQueueItem {
  return {
    id: '42-7-tn-mrk-14-2',
    tier: 1,
    label: 'Mark 14:2',
    progress: 1,
    status: 'completed',
    ...overrides,
  };
}

describe('offlineResources', () => {
  beforeEach(() => {
    resetFileSystemMock();
    jest.clearAllMocks();
  });

  describe('findDownloadedRows', () => {
    it('returns null when projectId is null', async () => {
      await expect(
        findDownloadedRows({
          projectId: null,
          userId: 7,
          resourceName: 'Translation Notes',
          kind: 'text',
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toBeNull();
      expect(mockGetRows).not.toHaveBeenCalled();
    });

    it('returns null when userId is missing', async () => {
      await expect(
        findDownloadedRows({
          projectId: 42,
          userId: null,
          resourceName: 'Translation Notes',
          kind: 'text',
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toBeNull();
      expect(mockGetRows).not.toHaveBeenCalled();
    });

    it('returns null when nothing is downloaded for the chapter (API fallback)', async () => {
      mockGetRows.mockResolvedValue([]);

      await expect(
        findDownloadedRows({
          projectId: 42,
          userId: 7,
          resourceName: 'Translation Notes',
          kind: 'text',
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toBeNull();
      expect(mockGetRows).toHaveBeenCalledWith(
        42,
        7,
        'Translation Notes',
        'text',
        'MRK',
        14,
      );
    });

    it('returns null when rows exist but none has a local file', async () => {
      mockGetRows.mockResolvedValue([queueRow({ localFilePath: undefined })]);

      await expect(
        findDownloadedRows({
          projectId: 42,
          userId: 7,
          resourceName: 'Translation Notes',
          kind: 'text',
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toBeNull();
    });

    it('returns all rows when verseNumber is omitted (chapter-level resources)', async () => {
      const rows = [
        queueRow({ id: 'row-a', localFilePath: 'file:///downloads/a.json' }),
        queueRow({ id: 'row-b', localFilePath: 'file:///downloads/b.png' }),
      ];
      mockGetRows.mockResolvedValue(rows);

      await expect(
        findDownloadedRows({
          projectId: 42,
          userId: 7,
          resourceName: 'Reference Images',
          kind: 'image',
          bookCode: 'MRK',
          chapterNumber: 14,
        }),
      ).resolves.toEqual(rows);
    });

    it('filters rows to those covering the verse', async () => {
      const rows = [
        queueRow({
          id: 'covers',
          localFilePath: 'file:///downloads/covers.json',
          verseStart: 2,
          verseEnd: 4,
        }),
        queueRow({
          id: 'outside',
          localFilePath: 'file:///downloads/outside.json',
          verseStart: 5,
          verseEnd: 6,
        }),
        // Chapter-level row (no verse scope) covers every verse.
        queueRow({
          id: 'chapter-level',
          localFilePath: 'file:///downloads/chapter.json',
        }),
      ];
      mockGetRows.mockResolvedValue(rows);

      const result = await findDownloadedRows({
        projectId: 42,
        userId: 7,
        resourceName: 'Translation Notes',
        kind: 'text',
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 3,
      });

      expect(result?.map(row => row.id)).toEqual(['covers', 'chapter-level']);
    });
  });

  describe('readDownloadedJson', () => {
    it('reads and parses a downloaded JSON file', async () => {
      const uri = 'file:///downloads/tn-mrk-14-2.json';
      await FileSystem.writeAsStringAsync(
        uri,
        JSON.stringify([{ tiptap: { type: 'doc' } }]),
      );

      await expect(
        readDownloadedJson(queueRow({ id: 'row-1', localFilePath: uri })),
      ).resolves.toEqual([{ tiptap: { type: 'doc' } }]);
    });

    it('returns undefined when the file is missing instead of throwing', async () => {
      await expect(
        readDownloadedJson(
          queueRow({
            id: 'row-2',
            localFilePath: 'file:///downloads/missing.json',
          }),
        ),
      ).resolves.toBeUndefined();
    });

    it('returns undefined when the file content is not valid JSON', async () => {
      const uri = 'file:///downloads/broken.json';
      await FileSystem.writeAsStringAsync(uri, 'not-json{');

      await expect(
        readDownloadedJson(queueRow({ id: 'row-3', localFilePath: uri })),
      ).resolves.toBeUndefined();
    });
  });
});
