import * as FileSystem from 'expo-file-system/legacy';
import { DownloadQueueWorker } from './downloadQueueWorker';
import type { DownloadQueueItem } from '../types/download/types';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';

const flushMicrotasks = () =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

const mockEnsureDownloadsDir = jest.fn().mockResolvedValue(undefined);
const mockDownloadResourcePath = jest.fn(
  (projectId: number, id: string, ext: string) =>
    `file:///docs/downloads/${projectId}/${id}.${ext}`,
);

jest.mock('./downloadStorage', () => ({
  ensureDownloadsDir: (...args: unknown[]) => mockEnsureDownloadsDir(...args),
  downloadResourcePath: (...args: [number, string, string]) =>
    mockDownloadResourcePath(...args),
}));

const mockMarkDownloadItemCompleted = jest.fn().mockResolvedValue(undefined);
const mockMarkDownloadItemFailed = jest.fn().mockResolvedValue(undefined);
const mockMarkDownloadItemPaused = jest.fn().mockResolvedValue(undefined);
const mockMarkDownloadItemCancelled = jest.fn().mockResolvedValue(undefined);
const mockMarkDownloadItemDownloading = jest.fn().mockResolvedValue(undefined);
const mockUpdateDownloadItemProgress = jest.fn().mockResolvedValue(undefined);

jest.mock('../db/downloadQueueRepository', () => ({
  markDownloadItemCancelled: (...args: unknown[]) =>
    mockMarkDownloadItemCancelled(...args),

  markDownloadItemCompleted: (...args: unknown[]) =>
    mockMarkDownloadItemCompleted(...args),

  markDownloadItemFailed: (...args: unknown[]) =>
    mockMarkDownloadItemFailed(...args),

  markDownloadItemPaused: (...args: unknown[]) =>
    mockMarkDownloadItemPaused(...args),

  markDownloadItemDownloading: (...args: unknown[]) =>
    mockMarkDownloadItemDownloading(...args),

  updateDownloadItemProgress: (...args: unknown[]) =>
    mockUpdateDownloadItemProgress(...args),
}));

function makeItem(
  overrides: Partial<DownloadQueueItem> = {},
): DownloadQueueItem {
  return {
    id: 'item-1',
    tier: 1,
    label: 'Source Bible — Audio',
    progress: 0,
    status: 'queued',
    projectId: 1,
    ...overrides,
  };
}

function spyResumable(overrides: Record<string, unknown> = {}) {
  return jest.spyOn(FileSystem, 'createDownloadResumable').mockImplementation(
    (_url, dest) =>
      ({
        downloadAsync: jest.fn().mockImplementation(async () => {
          await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
          return { uri: dest };
        }),
        pauseAsync: jest.fn().mockResolvedValue({
          url: 'https://example.com/x.mp3',
          fileUri: dest,
          options: {},
          resumeData: 'resume-token',
        }),
        resumeAsync: jest.fn().mockImplementation(async () => {
          await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
          return { uri: dest };
        }),
        ...overrides,
      } as unknown as FileSystem.DownloadResumable),
  );
}

describe('DownloadQueueWorker', () => {
  beforeEach(() => {
    resetFileSystemMock();
    jest.clearAllMocks();
  });

  it('starts idle', () => {
    const worker = new DownloadQueueWorker(async () => ({
      url: 'https://example.com/x.mp3',
      ext: 'mp3',
    }));
    expect(worker.getState()).toBe('idle');
  });

  it('processes a single item end to end and returns to idle', async () => {
    spyResumable();
    const resolver = jest
      .fn()
      .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

    const worker = new DownloadQueueWorker(resolver);
    await worker.start([makeItem()]);

    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1' }),
    );
    expect(mockEnsureDownloadsDir).toHaveBeenCalledWith(1);
    expect(mockDownloadResourcePath).toHaveBeenCalledWith(1, 'item-1', 'mp3');
    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'item-1',
      'file:///docs/downloads/1/item-1.mp3',
      expect.any(Number),
    );
    expect(worker.getState()).toBe('idle');
  });

  it('processes multiple items sequentially, one at a time', async () => {
    spyResumable();
    const resolver = jest
      .fn()
      .mockResolvedValueOnce({ url: 'https://example.com/a.mp3', ext: 'mp3' })
      .mockResolvedValueOnce({ url: 'https://example.com/b.txt', ext: 'txt' });

    const worker = new DownloadQueueWorker(resolver);
    await worker.start([
      makeItem({ id: 'item-1' }),
      makeItem({ id: 'item-2', tier: 2 }),
    ]);

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(mockMarkDownloadItemCompleted).toHaveBeenNthCalledWith(
      1,
      'item-1',
      expect.any(String),
      expect.any(Number),
    );
    expect(mockMarkDownloadItemCompleted).toHaveBeenNthCalledWith(
      2,
      'item-2',
      expect.any(String),
      expect.any(Number),
    );
  });

  it('marks an item failed and continues to the next item when the resolver rejects', async () => {
    spyResumable();
    const resolver = jest
      .fn()
      .mockRejectedValueOnce(new Error('no manifest yet'))
      .mockResolvedValueOnce({ url: 'https://example.com/b.txt', ext: 'txt' });

    const worker = new DownloadQueueWorker(resolver);
    await worker.start([
      makeItem({ id: 'item-1' }),
      makeItem({ id: 'item-2' }),
    ]);

    expect(mockMarkDownloadItemFailed).toHaveBeenCalledWith('item-1');
    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'item-2',
      expect.any(String),
      expect.any(Number),
    );
  });

  it('marks an item failed when downloadAsync itself rejects', async () => {
    spyResumable({
      downloadAsync: jest.fn().mockRejectedValue(new Error('network error')),
    });
    const resolver = jest
      .fn()
      .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

    const worker = new DownloadQueueWorker(resolver);
    await worker.start([makeItem()]);

    expect(mockMarkDownloadItemFailed).toHaveBeenCalledWith('item-1');
    expect(mockMarkDownloadItemCompleted).not.toHaveBeenCalled();
  });

  it('reports fractional progress via updateDownloadItemProgress as bytes arrive', async () => {
    let capturedProgressCallback:
      | ((progress: {
          totalBytesWritten: number;
          totalBytesExpectedToWrite: number;
        }) => void)
      | undefined;

    jest
      .spyOn(FileSystem, 'createDownloadResumable')
      .mockImplementation((_url, dest, _opts, onProgress) => {
        capturedProgressCallback = onProgress;
        return {
          downloadAsync: jest.fn().mockResolvedValue({ uri: dest }),
          pauseAsync: jest.fn(),
          resumeAsync: jest.fn(),
        } as unknown as FileSystem.DownloadResumable;
      });
    const resolver = jest
      .fn()
      .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

    const worker = new DownloadQueueWorker(resolver);
    const startPromise = worker.start([makeItem()]);

    await flushMicrotasks();

    capturedProgressCallback?.({
      totalBytesWritten: 300,
      totalBytesExpectedToWrite: 1000,
    });
    expect(mockUpdateDownloadItemProgress).toHaveBeenCalledWith('item-1', 0.3);

    await startPromise;
  });

  describe('pause / resume', () => {
    it('pause suspends the active resumable and sets state to paused', async () => {
      let resolveDownload!: (value: { uri: string }) => void;
      const pending = new Promise<{ uri: string }>(resolve => {
        resolveDownload = resolve;
      });
      const pauseAsync = jest.fn().mockResolvedValue({
        url: 'https://example.com/x.mp3',
        fileUri: 'file:///docs/downloads/1/item-1.mp3',
        options: {},
        resumeData: 'resume-token',
      });
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(pending),
        pauseAsync,
      });

      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      const startPromise = worker.start([makeItem()]);

      await flushMicrotasks();
      await flushMicrotasks();

      await worker.pause();

      expect(pauseAsync).toHaveBeenCalled();
      expect(mockMarkDownloadItemPaused).toHaveBeenCalledWith(
        'item-1',
        expect.stringContaining('resume-token'),
      );
      expect(worker.getState()).toBe('paused');

      resolveDownload({ uri: 'file:///docs/downloads/1/item-1.mp3' });
      await startPromise;
    });

    it('resume continues the active resumable and completes the item', async () => {
      const resumeAsync = jest.fn().mockImplementation(async () => {
        await FileSystem.writeAsStringAsync(
          'file:///docs/downloads/1/item-1.mp3',
          'mock-bytes',
        );
        return { uri: 'file:///docs/downloads/1/item-1.mp3' };
      });
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
        resumeAsync,
      });
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      void worker.start([makeItem()]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.pause();
      expect(worker.getState()).toBe('paused');

      await worker.resume();

      expect(resumeAsync).toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'item-1',
        'file:///docs/downloads/1/item-1.mp3',
        expect.any(Number),
      );
      expect(worker.getState()).toBe('idle');
    });

    it('pause is a no-op when nothing is active', async () => {
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      await worker.pause();
      expect(worker.getState()).toBe('idle');
    });

    it('resume is a no-op when not paused', async () => {
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      await worker.resume();
      expect(worker.getState()).toBe('idle');
    });
  });

  describe('cancel', () => {
    it('pauses the active transfer, retains no queue, and sets state to cancelled', async () => {
      const pauseAsync = jest.fn().mockResolvedValue({
        url: 'https://example.com/x.mp3',
        fileUri: 'file:///docs/downloads/1/item-1.mp3',
        options: {},
        resumeData: 'resume-token',
      });
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
        pauseAsync,
      });
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      void worker.start([makeItem(), makeItem({ id: 'item-2' })]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.cancel();

      expect(pauseAsync).toHaveBeenCalled();
      expect(mockMarkDownloadItemCancelled).toHaveBeenCalledWith(
        'item-1',
        expect.stringContaining('resume-token'),
      );
      expect(worker.getState()).toBe('cancelled');
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
    });
    it('cancel with nothing active still transitions state and clears the queue', async () => {
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      await worker.cancel();
      expect(worker.getState()).toBe('cancelled');
    });
  });

  describe('start guard', () => {
    it('ignores a second start() call while already downloading', async () => {
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
      });
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      void worker.start([makeItem()]);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(worker.getState()).toBe('downloading');
      await worker.start([makeItem({ id: 'should-be-ignored' })]);

      expect(resolver).toHaveBeenCalledTimes(1);
    });
  });

  it('restores a paused item using persisted resume data', async () => {
    const resumeAsync = jest.fn().mockImplementation(async () => {
      await FileSystem.writeAsStringAsync(
        'file:///docs/downloads/1/item-1.mp3',
        'mock-bytes',
      );
      return { uri: 'file:///docs/downloads/1/item-1.mp3' };
    });
    const createSpy = spyResumable({
      downloadAsync: jest.fn(),
      resumeAsync,
    });
    const resolver = jest
      .fn()
      .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });
    const resumeData = JSON.stringify({
      url: 'https://example.com/x.mp3',
      fileUri: 'file:///docs/downloads/1/item-1.mp3',
      options: {},
      resumeData: 'resume-token',
    });

    const worker = new DownloadQueueWorker(resolver);
    await worker.start([makeItem({ status: 'paused', resumeData })]);

    expect(createSpy).toHaveBeenCalledWith(
      'https://example.com/x.mp3',
      'file:///docs/downloads/1/item-1.mp3',
      {},
      expect.any(Function),
      'resume-token',
    );
    expect(resumeAsync).toHaveBeenCalled();
    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'item-1',
      'file:///docs/downloads/1/item-1.mp3',
      expect.any(Number),
    );
  });
});
