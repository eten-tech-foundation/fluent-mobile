import * as FileSystem from 'expo-file-system/legacy';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import { findDownloadedRows } from './offlineResources';
import {
  persistSourceAudioChapterMeta,
  readSourceAudioChapterMeta,
  resolveLocalChapterSourceAudio,
  sourceAudioMetaPath,
  SOURCE_BIBLE_RESOURCE_NAME,
} from './offlineSourceAudio';

jest.mock('./offlineResources', () => ({
  findDownloadedRows: jest.fn(),
}));

const mockFindRows = findDownloadedRows as jest.MockedFunction<
  typeof findDownloadedRows
>;

const chapterResponse = {
  provider: 'aquifer' as const,
  bible: { name: 'BSB', abbreviation: 'BSB' },
  bookCode: 'MRK',
  chapter: 1,
  items: [
    {
      format: 'mp3' as const,
      url: 'https://cdn.example/ch.mp3',
      scope: 'chapter' as const,
      durationSeconds: 120,
      sizeBytes: 1_000_000,
    },
  ],
  verseTimestamps: [
    { verse: 1, startSeconds: 0 },
    { verse: 2, startSeconds: 4 },
  ],
};

describe('offlineSourceAudio', () => {
  beforeEach(() => {
    resetFileSystemMock();
    jest.clearAllMocks();
  });

  describe('persistSourceAudioChapterMeta / readSourceAudioChapterMeta', () => {
    it('writes and reads verse timestamps for a chapter', async () => {
      await persistSourceAudioChapterMeta(42, chapterResponse);

      await expect(
        readSourceAudioChapterMeta(42, 'MRK', 1),
      ).resolves.toMatchObject({
        bookCode: 'MRK',
        chapter: 1,
        verseTimestamps: chapterResponse.verseTimestamps,
        format: 'mp3',
        durationSeconds: 120,
      });
      expect(sourceAudioMetaPath(42, 'MRK', 1)).toContain(
        'source-audio-meta/MRK-1.json',
      );
    });

    it('returns null when the sidecar is missing', async () => {
      await expect(
        readSourceAudioChapterMeta(42, 'MRK', 1),
      ).resolves.toBeNull();
    });
  });

  describe('resolveLocalChapterSourceAudio', () => {
    it('returns null when nothing is downloaded', async () => {
      mockFindRows.mockResolvedValue(null);

      await expect(
        resolveLocalChapterSourceAudio({
          projectId: 42,
          bookCode: 'MRK',
          chapter: 1,
          userId: 7,
        }),
      ).resolves.toBeNull();
      expect(mockFindRows).toHaveBeenCalledWith({
        projectId: 42,
        userId: 7,
        resourceName: SOURCE_BIBLE_RESOURCE_NAME,
        kind: 'audio',
        bookCode: 'MRK',
        chapterNumber: 1,
      });
    });

    it('returns a local file URI with persisted verse timestamps', async () => {
      const localPath = 'file:///mock-document/downloads/42/audio.mp3';
      await FileSystem.writeAsStringAsync(localPath, 'fake-mp3');
      await persistSourceAudioChapterMeta(42, chapterResponse);
      mockFindRows.mockResolvedValue([
        {
          id: '42-7-source-bible-audio-MRK-1',
          tier: 1,
          label: 'Audio',
          progress: 1,
          status: 'completed',
          localFilePath: localPath,
          kind: 'audio',
          resourceName: SOURCE_BIBLE_RESOURCE_NAME,
        },
      ]);

      const resolved = await resolveLocalChapterSourceAudio({
        projectId: 42,
        bookCode: 'MRK',
        chapter: 1,
        userId: 7,
      });

      expect(resolved).toMatchObject({
        bookCode: 'MRK',
        chapter: 1,
        verseTimestamps: chapterResponse.verseTimestamps,
        items: [
          expect.objectContaining({
            url: localPath,
            format: 'mp3',
            scope: 'chapter',
          }),
        ],
      });
      expect(resolved?.items[0]?.expiresAt).toBeUndefined();
    });

    it('skips rows whose local file is missing on disk', async () => {
      mockFindRows.mockResolvedValue([
        {
          id: 'missing',
          tier: 1,
          label: 'Audio',
          progress: 1,
          status: 'completed',
          localFilePath: 'file:///mock-document/downloads/42/gone.mp3',
          kind: 'audio',
        },
      ]);

      await expect(
        resolveLocalChapterSourceAudio({
          projectId: 42,
          bookCode: 'MRK',
          chapter: 1,
          userId: 7,
        }),
      ).resolves.toBeNull();
    });

    it('returns null when userId is missing (no download_queue lookup)', async () => {
      await expect(
        resolveLocalChapterSourceAudio({
          projectId: 42,
          bookCode: 'MRK',
          chapter: 1,
          userId: null,
        }),
      ).resolves.toBeNull();
      expect(mockFindRows).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null }),
      );
    });
  });
});
