const mockGetInfoAsync = jest.fn();
const mockCreateDownloadResumable = jest.fn();

const flushMicrotasks = () =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (path: string) => mockGetInfoAsync(path),
  createDownloadResumable: (...args: unknown[]) =>
    mockCreateDownloadResumable(...args),
}));

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
const mockUpdateDownloadItemProgress = jest.fn().mockResolvedValue(undefined);

jest.mock('../db/downloadQueueRepository', () => ({
  markDownloadItemCompleted: (...args: unknown[]) =>
    mockMarkDownloadItemCompleted(...args),
  markDownloadItemFailed: (...args: unknown[]) =>
    mockMarkDownloadItemFailed(...args),
  updateDownloadItemProgress: (...args: unknown[]) =>
    mockUpdateDownloadItemProgress(...args),
}));

import { DownloadQueueWorker } from './downloadQueueWorker';
import type { DownloadQueueItem } from '../types/download/types';

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

function makeResumable(overrides: Record<string, unknown> = {}) {
  return {
    downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///docs/x.mp3' }),
    pauseAsync: jest.fn().mockResolvedValue(undefined),
    resumeAsync: jest.fn().mockResolvedValue({ uri: 'file:///docs/x.mp3' }),
    ...overrides,
  };
}

describe('DownloadQueueWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 999 });
  });

  it('starts idle', () => {
    const worker = new DownloadQueueWorker(async () => ({
      url: 'https://example.com/x.mp3',
      ext: 'mp3',
    }));
    expect(worker.getState()).toBe('idle');
  });

  it('processes a single item end to end and returns to idle', async () => {
    const resumable = makeResumable();
    mockCreateDownloadResumable.mockReturnValue(resumable);
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
    expect(resumable.downloadAsync).toHaveBeenCalled();
    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'item-1',
      'file:///docs/x.mp3',
      999,
    );
    expect(worker.getState()).toBe('idle');
  });

  it('processes multiple items sequentially, one at a time', async () => {
    const resumable1 = makeResumable({
      downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///docs/a.mp3' }),
    });
    const resumable2 = makeResumable({
      downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///docs/b.txt' }),
    });
    mockCreateDownloadResumable
      .mockReturnValueOnce(resumable1)
      .mockReturnValueOnce(resumable2);

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
      'file:///docs/a.mp3',
      999,
    );
    expect(mockMarkDownloadItemCompleted).toHaveBeenNthCalledWith(
      2,
      'item-2',
      'file:///docs/b.txt',
      999,
    );
  });

  it('marks an item failed and continues to the next item when the resolver rejects', async () => {
    const resumable = makeResumable();
    mockCreateDownloadResumable.mockReturnValue(resumable);
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
      'file:///docs/x.mp3',
      999,
    );
  });

  it('marks an item failed when downloadAsync itself rejects', async () => {
    const resumable = makeResumable({
      downloadAsync: jest.fn().mockRejectedValue(new Error('network error')),
    });
    mockCreateDownloadResumable.mockReturnValue(resumable);
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

    mockCreateDownloadResumable.mockImplementation(
      (_url, _dest, _opts, onProgress) => {
        capturedProgressCallback = onProgress;
        return makeResumable();
      },
    );
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
      const resumable = makeResumable({
        downloadAsync: jest.fn().mockReturnValue(pending),
      });
      mockCreateDownloadResumable.mockReturnValue(resumable);
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      const startPromise = worker.start([makeItem()]);

      // Let processNext reach the point of having an active resumable.
      await Promise.resolve();
      await Promise.resolve();

      await worker.pause();

      expect(resumable.pauseAsync).toHaveBeenCalled();
      expect(worker.getState()).toBe('paused');

      // Clean up the still-pending download so the test doesn't hang.
      resolveDownload({ uri: 'file:///docs/x.mp3' });
      await startPromise;
    });

    it('resume continues the active resumable and completes the item', async () => {
      const resumable = makeResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})), // never resolves — paused before completion
        resumeAsync: jest
          .fn()
          .mockResolvedValue({ uri: 'file:///docs/resumed.mp3' }),
      });
      mockCreateDownloadResumable.mockReturnValue(resumable);
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      void worker.start([makeItem()]);
      await Promise.resolve();
      await Promise.resolve();

      await worker.pause();
      expect(worker.getState()).toBe('paused');

      await worker.resume();

      expect(resumable.resumeAsync).toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'item-1',
        'file:///docs/resumed.mp3',
        999,
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
      const resumable = makeResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
      });
      mockCreateDownloadResumable.mockReturnValue(resumable);
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      void worker.start([makeItem(), makeItem({ id: 'item-2' })]);
      await Promise.resolve();
      await Promise.resolve();

      await worker.cancel();

      expect(resumable.pauseAsync).toHaveBeenCalled();
      expect(worker.getState()).toBe('cancelled');

      // Cancel must not delete the DB row or mark it failed — partials are
      // retained for later Wi-Fi resume, per #52's explicit requirement.
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
      const resumable = makeResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
      });
      mockCreateDownloadResumable.mockReturnValue(resumable);
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      void worker.start([makeItem()]);
      await Promise.resolve();
      await Promise.resolve();

      expect(worker.getState()).toBe('downloading');
      await worker.start([makeItem({ id: 'should-be-ignored' })]);

      // Resolver should only have been called once — for the original item.
      expect(resolver).toHaveBeenCalledTimes(1);
    });
  });
});
