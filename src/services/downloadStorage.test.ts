type FileInfo = { exists: boolean; size?: number };

const mockGetInfoAsync = jest.fn<Promise<FileInfo>, [string]>();
const mockMakeDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockDownloadAsync = jest.fn();
const mockPauseAsync = jest.fn();
const mockCreateDownloadResumable = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  get documentDirectory() {
    return 'file:///docs/';
  },
  getInfoAsync: (path: string) => mockGetInfoAsync(path),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  createDownloadResumable: (...args: unknown[]) =>
    mockCreateDownloadResumable(...args),
}));

import {
  deleteFile,
  downloadResourceFile,
  downloadResourcePath,
  ensureDownloadsDir,
  fileExists,
  fileSize,
} from './downloadStorage';

describe('downloadStorage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('downloadResourcePath', () => {
    it('builds a path nested by project id, keyed by resource id and extension', () => {
      const path = downloadResourcePath(42, 'dlq_abc123', 'mp3');
      expect(path).toBe('file:///docs/downloads/42/dlq_abc123.mp3');
    });
  });

  describe('ensureDownloadsDir', () => {
    it('creates the directory when it does not exist', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });

      await ensureDownloadsDir(42);

      expect(mockGetInfoAsync).toHaveBeenCalledWith(
        'file:///docs/downloads/42/',
      );
      expect(mockMakeDirectoryAsync).toHaveBeenCalledWith(
        'file:///docs/downloads/42/',
        { intermediates: true },
      );
    });

    it('does not create the directory when it already exists', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true });

      await ensureDownloadsDir(42);

      expect(mockMakeDirectoryAsync).not.toHaveBeenCalled();
    });
  });

  describe('fileExists / fileSize / deleteFile', () => {
    it('fileExists reflects getInfoAsync().exists', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true });
      await expect(fileExists('file:///x')).resolves.toBe(true);

      mockGetInfoAsync.mockResolvedValue({ exists: false });
      await expect(fileExists('file:///x')).resolves.toBe(false);
    });

    it('fileSize returns the size when the file exists', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true, size: 12345 });
      await expect(fileSize('file:///x')).resolves.toBe(12345);
    });

    it('fileSize returns undefined when the file does not exist', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });
      await expect(fileSize('file:///x')).resolves.toBeUndefined();
    });

    it('deleteFile calls deleteAsync idempotently', async () => {
      await deleteFile('file:///x');
      expect(mockDeleteAsync).toHaveBeenCalledWith('file:///x', {
        idempotent: true,
      });
    });
  });

  describe('downloadResourceFile', () => {
    it('downloads via a resumable, reports progress, and returns the final path/size', async () => {
      let capturedProgressCallback:
        | ((progress: {
            totalBytesWritten: number;
            totalBytesExpectedToWrite: number;
          }) => void)
        | undefined;

      mockCreateDownloadResumable.mockImplementation(
        (_url, _dest, _opts, onProgress) => {
          capturedProgressCallback = onProgress;
          return {
            downloadAsync: mockDownloadAsync,
            pauseAsync: mockPauseAsync,
          };
        },
      );
      mockDownloadAsync.mockResolvedValue({ uri: 'file:///docs/x.mp3' });
      mockGetInfoAsync.mockResolvedValue({ exists: true, size: 500 });

      const onProgress = jest.fn();
      const result = await downloadResourceFile(
        'https://example.com/x.mp3',
        'file:///docs/x.mp3',
        onProgress,
      );

      expect(mockCreateDownloadResumable).toHaveBeenCalledWith(
        'https://example.com/x.mp3',
        'file:///docs/x.mp3',
        {},
        expect.any(Function),
      );

      capturedProgressCallback?.({
        totalBytesWritten: 250,
        totalBytesExpectedToWrite: 500,
      });
      expect(onProgress).toHaveBeenCalledWith(0.5);

      expect(result).toEqual({ path: 'file:///docs/x.mp3', size: 500 });
    });

    it('throws when the download does not complete (result is undefined)', async () => {
      mockCreateDownloadResumable.mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue(undefined),
        pauseAsync: mockPauseAsync,
      });

      await expect(
        downloadResourceFile('https://example.com/x.mp3', 'file:///docs/x.mp3'),
      ).rejects.toThrow('Download did not complete');
    });

    it('does not call onProgress when totalBytesExpectedToWrite is 0', async () => {
      let capturedProgressCallback:
        | ((progress: {
            totalBytesWritten: number;
            totalBytesExpectedToWrite: number;
          }) => void)
        | undefined;

      mockCreateDownloadResumable.mockImplementation(
        (_url, _dest, _opts, onProgress) => {
          capturedProgressCallback = onProgress;
          return {
            downloadAsync: jest
              .fn()
              .mockResolvedValue({ uri: 'file:///docs/x.mp3' }),
            pauseAsync: mockPauseAsync,
          };
        },
      );
      mockGetInfoAsync.mockResolvedValue({ exists: true, size: 0 });

      const onProgress = jest.fn();
      await downloadResourceFile(
        'https://example.com/x.mp3',
        'file:///docs/x.mp3',
        onProgress,
      );

      capturedProgressCallback?.({
        totalBytesWritten: 0,
        totalBytesExpectedToWrite: 0,
      });
      expect(onProgress).not.toHaveBeenCalled();
    });
  });
});
