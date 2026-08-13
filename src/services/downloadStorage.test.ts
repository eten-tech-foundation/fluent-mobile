import * as FileSystem from 'expo-file-system/legacy';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import {
  assertDeletableDownloadPath,
  deleteDownloadResourceFile,
  deleteFile,
  downloadResourceFile,
  downloadResourcePath,
  ensureDownloadsDir,
  fileExists,
  fileSize,
} from './downloadStorage';

describe('downloadStorage', () => {
  beforeEach(() => {
    resetFileSystemMock();
  });

  describe('downloadResourcePath', () => {
    it('builds a path nested by project id, keyed by resource id and extension', () => {
      const path = downloadResourcePath(42, 'dlq_abc123', 'mp3');
      expect(path).toBe(
        `${FileSystem.documentDirectory}downloads/42/dlq_abc123.mp3`,
      );
    });

    it('rejects a resourceId containing a path traversal segment', () => {
      expect(() => downloadResourcePath(42, '../other', 'mp3')).toThrow(
        /Unsafe resourceId/,
      );
    });

    it('rejects a resourceId containing a forward slash', () => {
      expect(() => downloadResourcePath(42, 'foo/bar', 'mp3')).toThrow(
        /Unsafe resourceId/,
      );
    });

    it('rejects a URL-encoded traversal attempt in resourceId', () => {
      expect(() => downloadResourcePath(42, 'foo%2Fbar', 'mp3')).toThrow(
        /Unsafe resourceId/,
      );
    });

    it('rejects an unsafe extension', () => {
      expect(() =>
        downloadResourcePath(42, 'dlq_abc123', '../../evil'),
      ).toThrow(/Unsafe ext/);
    });
  });

  describe('ensureDownloadsDir', () => {
    it('creates the directory when it does not exist', async () => {
      const dir = `${FileSystem.documentDirectory}downloads/42/`;
      await expect(FileSystem.getInfoAsync(dir)).resolves.toMatchObject({
        exists: false,
      });

      await ensureDownloadsDir(42);

      await expect(FileSystem.getInfoAsync(dir)).resolves.toMatchObject({
        exists: true,
        isDirectory: true,
      });
    });

    it('does not throw when the directory already exists', async () => {
      await ensureDownloadsDir(42);
      await expect(ensureDownloadsDir(42)).resolves.not.toThrow();
    });
  });

  describe('fileExists / fileSize / deleteFile', () => {
    it('fileExists reflects real presence in the virtual filesystem', async () => {
      const path = `${FileSystem.documentDirectory}downloads/1/x.mp3`;
      await expect(fileExists(path)).resolves.toBe(false);

      await FileSystem.writeAsStringAsync(path, 'bytes');
      await expect(fileExists(path)).resolves.toBe(true);
    });

    it('fileSize returns the content length once written', async () => {
      const path = `${FileSystem.documentDirectory}downloads/1/x.mp3`;
      await FileSystem.writeAsStringAsync(path, 'twelve-bytes');
      await expect(fileSize(path)).resolves.toBe('twelve-bytes'.length);
    });

    it('fileSize returns undefined when the file does not exist', async () => {
      await expect(
        fileSize(`${FileSystem.documentDirectory}downloads/1/missing.mp3`),
      ).resolves.toBeUndefined();
    });

    it('deleteFile removes the file from the virtual filesystem', async () => {
      const path = `${FileSystem.documentDirectory}downloads/1/x.mp3`;
      await FileSystem.writeAsStringAsync(path, 'bytes');
      await deleteFile(path);
      await expect(fileExists(path)).resolves.toBe(false);
    });

    it('deleteFile is idempotent for a nonexistent file', async () => {
      await expect(
        deleteFile(`${FileSystem.documentDirectory}downloads/1/missing.mp3`),
      ).resolves.not.toThrow();
    });
  });

  describe('assertDeletableDownloadPath / deleteDownloadResourceFile', () => {
    it('allows paths under the project downloads directory', () => {
      const path = `${FileSystem.documentDirectory}downloads/42/resource.mp3`;
      expect(() => assertDeletableDownloadPath(42, path)).not.toThrow();
    });

    it('rejects paths outside the project sandbox', () => {
      expect(() =>
        assertDeletableDownloadPath(2, 'file:///etc/passwd'),
      ).toThrow(/outside the project sandbox/);
    });

    it('rejects path traversal segments', () => {
      const path = `${FileSystem.documentDirectory}downloads/2/../1/evil.mp3`;
      expect(() => assertDeletableDownloadPath(2, path)).toThrow(
        /Unsafe path segment/,
      );
    });

    it('deleteDownloadResourceFile removes a sandboxed file', async () => {
      const path = `${FileSystem.documentDirectory}downloads/3/x.mp3`;
      await FileSystem.writeAsStringAsync(path, 'bytes');
      await deleteDownloadResourceFile(3, path);
      await expect(fileExists(path)).resolves.toBe(false);
    });
  });

  describe('downloadResourceFile', () => {
    it('downloads via a resumable, reports progress, and returns the final path/size', async () => {
      const onProgress = jest.fn();
      const destPath = `${FileSystem.documentDirectory}downloads/1/x.mp3`;

      const result = await downloadResourceFile(
        'https://example.com/x.mp3',
        destPath,
        onProgress,
      );

      expect(onProgress).toHaveBeenCalledWith(1);
      expect(result.path).toBe(destPath);
      expect(result.size).toBeGreaterThan(0);
      await expect(fileExists(destPath)).resolves.toBe(true);
    });

    it('throws when the download does not complete (result is undefined)', async () => {
      jest.spyOn(FileSystem, 'createDownloadResumable').mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue(undefined),
        pauseAsync: jest.fn(),
        resumeAsync: jest.fn(),
      } as unknown as FileSystem.DownloadResumable);

      await expect(
        downloadResourceFile(
          'https://example.com/x.mp3',
          `${FileSystem.documentDirectory}downloads/1/x.mp3`,
        ),
      ).rejects.toThrow('Download did not complete');
    });

    it('does not call onProgress when totalBytesExpectedToWrite is 0', async () => {
      jest.spyOn(FileSystem, 'createDownloadResumable').mockImplementation(
        (_url, dest, _opts, onProgress) =>
          ({
            downloadAsync: async () => {
              onProgress?.({
                totalBytesWritten: 0,
                totalBytesExpectedToWrite: 0,
              });
              return { uri: dest };
            },
            pauseAsync: async () => {},
            resumeAsync: async () => ({ uri: dest }),
          } as unknown as FileSystem.DownloadResumable),
      );

      const onProgress = jest.fn();
      await downloadResourceFile(
        'https://example.com/x.mp3',
        `${FileSystem.documentDirectory}downloads/1/x.mp3`,
        onProgress,
      );

      expect(onProgress).not.toHaveBeenCalled();
    });
  });
});
