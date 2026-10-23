import * as FileSystem from 'expo-file-system/legacy';

jest.mock('../utils/logger', () => {
  const mockWorkerLog = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    logger: {
      create: () => mockWorkerLog,
    },
    mockWorkerLog,
  };
});

const { mockWorkerLog } = jest.requireMock('../utils/logger') as {
  mockWorkerLog: {
    debug: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
};

import {
  DownloadQueueWorker,
  isMissingNativeDownloadObjectError,
} from './downloadQueueWorker';
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

describe('isMissingNativeDownloadObjectError', () => {
  it('matches Expo FS / Android IOException phrasing', () => {
    expect(
      isMissingNativeDownloadObjectError(
        new Error(
          "Call to function 'ExponentFileSystem.downloadResumablePauseAsync' has been rejected.\n→ Caused by: java.io.IOException: No download object available",
        ),
      ),
    ).toBe(true);
    expect(
      isMissingNativeDownloadObjectError('No download object available'),
    ).toBe(true);
  });

  it('fails closed for unrelated and malformed values', () => {
    expect(isMissingNativeDownloadObjectError(new Error('ENOSPC'))).toBe(false);
    expect(isMissingNativeDownloadObjectError(null)).toBe(false);
    expect(isMissingNativeDownloadObjectError(undefined)).toBe(false);
    expect(
      isMissingNativeDownloadObjectError({
        message: 'No download object available',
      }),
    ).toBe(false);
  });
});

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

  it('enqueueAdditional appends while downloading and de-dupes active/queued ids', async () => {
    let resolveFirst!: (value: { uri: string }) => void;
    const firstPending = new Promise<{ uri: string }>(resolve => {
      resolveFirst = resolve;
    });
    const createSpy = jest
      .spyOn(FileSystem, 'createDownloadResumable')
      .mockImplementation(
        (_url, dest) =>
          ({
            downloadAsync: jest.fn().mockImplementation(async () => {
              if (dest.includes('item-1')) {
                await firstPending;
              }
              await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
              return { uri: dest };
            }),
            pauseAsync: jest.fn(),
            resumeAsync: jest.fn(),
          } as unknown as FileSystem.DownloadResumable),
      );

    const worker = new DownloadQueueWorker(async () => ({
      url: 'https://example.com/x.mp3',
      ext: 'mp3',
    }));
    const startPromise = worker.start([makeItem({ id: 'item-1' })]);
    await flushMicrotasks();

    worker.enqueueAdditional([
      makeItem({ id: 'item-1' }),
      makeItem({ id: 'item-2', label: 'Draft' }),
    ]);
    resolveFirst({ uri: 'file:///docs/downloads/1/item-1.mp3' });
    await startPromise;

    expect(createSpy).toHaveBeenCalled();
    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'item-2',
      expect.any(String),
      expect.any(Number),
    );
  });

  it('dropItems during deferred resolver cancels shifted item; unrelated queued item remains safe', async () => {
    let resolveDraft!: (value: { url: string; ext: string }) => void;
    const draftResolverPending = new Promise<{ url: string; ext: string }>(
      resolve => {
        resolveDraft = resolve;
      },
    );
    const resolver = jest
      .fn()
      .mockImplementation(async (item: DownloadQueueItem) => {
        if (item.id === 'draft-resolving') {
          return draftResolverPending;
        }
        return { url: 'https://example.com/pfo.mp3', ext: 'mp3' };
      });
    const createSpy = spyResumable();

    const worker = new DownloadQueueWorker(resolver);
    const startPromise = worker.start([
      makeItem({ id: 'draft-resolving', label: 'Draft audio' }),
      makeItem({ id: 'pfo-unrelated', label: 'PFO audio', tier: 2 }),
    ]);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'draft-resolving' }),
    );
    expect(createSpy).not.toHaveBeenCalled();

    // Stage-exit purge while resolver is still pending — active is null.
    await worker.dropItems(['draft-resolving']);
    // Retry during resolver await must not be de-duped against the cancelled
    // resolving slot (deterministic draft ids).
    worker.enqueueAdditional([
      makeItem({ id: 'draft-resolving', label: 'Draft audio' }),
    ]);

    resolveDraft({ url: 'https://example.com/draft.mp3', ext: 'mp3' });
    await startPromise;

    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'pfo-unrelated',
      expect.any(String),
      expect.any(Number),
    );
    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'draft-resolving',
      expect.any(String),
      expect.any(Number),
    );
    const completedIds = mockMarkDownloadItemCompleted.mock.calls.map(
      call => call[0],
    );
    expect(completedIds).toContain('pfo-unrelated');
    expect(completedIds).toContain('draft-resolving');
  });

  it('enqueueAdditional de-dupes the resolving (pre-active) item id', async () => {
    let resolveDraft!: (value: { url: string; ext: string }) => void;
    const draftResolverPending = new Promise<{ url: string; ext: string }>(
      resolve => {
        resolveDraft = resolve;
      },
    );
    const resolver = jest
      .fn()
      .mockImplementation(async () => draftResolverPending);
    spyResumable();

    const worker = new DownloadQueueWorker(resolver);
    const startPromise = worker.start([makeItem({ id: 'draft-resolving' })]);
    await flushMicrotasks();
    await flushMicrotasks();

    worker.enqueueAdditional([
      makeItem({ id: 'draft-resolving' }),
      makeItem({ id: 'item-extra' }),
    ]);

    resolveDraft({ url: 'https://example.com/x.mp3', ext: 'mp3' });
    await startPromise;

    expect(
      resolver.mock.calls.filter(c => c[0].id === 'draft-resolving'),
    ).toHaveLength(1);
    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'item-extra',
      expect.any(String),
      expect.any(Number),
    );
  });

  it('dropItems removes pending ids and does not clear unrelated paused state', async () => {
    const worker = new DownloadQueueWorker(async () => ({
      url: 'https://example.com/x.mp3',
      ext: 'mp3',
    }));
    // Seed a paused session with a pending second item via private state through start+pause.
    let resolveDownload!: (value: { uri: string }) => void;
    const pending = new Promise<{ uri: string }>(resolve => {
      resolveDownload = resolve;
    });
    jest.spyOn(FileSystem, 'createDownloadResumable').mockImplementation(
      (_url, dest) =>
        ({
          downloadAsync: jest.fn().mockImplementation(async () => {
            await pending;
            await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
            return { uri: dest };
          }),
          pauseAsync: jest.fn().mockResolvedValue({
            url: 'https://example.com/x.mp3',
            fileUri: dest,
            options: {},
            resumeData: 'resume-token',
          }),
          resumeAsync: jest.fn(),
        } as unknown as FileSystem.DownloadResumable),
    );

    const startPromise = worker.start([
      makeItem({ id: 'item-1' }),
      makeItem({ id: 'item-2' }),
    ]);
    await flushMicrotasks();
    await worker.pause('user');
    await worker.dropItems(['item-2']);
    expect(worker.getState()).toBe('paused');
    resolveDownload({ uri: 'file:///docs/downloads/1/item-1.mp3' });
    await startPromise;
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

    it('does not mark a cancelled item failed when resumeAsync rejects after cancel()', async () => {
      // Mirror processNext(): if cancel() runs while resumeAsync() is in flight
      // and then rejects, the catch must not overwrite 'cancelled' with 'failed'.
      let rejectResume!: (reason?: unknown) => void;
      const pendingResume = new Promise<{ uri: string }>((_, reject) => {
        rejectResume = reject;
      });
      const pauseAsync = jest.fn().mockResolvedValue({
        url: 'https://example.com/x.mp3',
        fileUri: 'file:///docs/downloads/1/item-1.mp3',
        options: {},
        resumeData: 'resume-token',
      });
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
        pauseAsync,
        resumeAsync: jest.fn().mockReturnValue(pendingResume),
      });
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      void worker.start([makeItem()]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.pause();
      const resumePromise = worker.resume();
      await flushMicrotasks();

      await worker.cancel();
      rejectResume(new Error('resume aborted'));
      await resumePromise;

      expect(mockMarkDownloadItemCancelled).toHaveBeenCalledWith(
        'item-1',
        expect.stringContaining('resume-token'),
      );
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
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
      expect(worker.getState()).toBe('idle');
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
    });

    it('does not error-log when pauseAsync on cancel reports missing native download object', async () => {
      // #793: Expo FS pauseAsync can reject with
      // "No download object available" while cancel still completes benignly.
      const pauseAsync = jest
        .fn()
        .mockRejectedValue(
          new Error(
            "Call to function 'ExponentFileSystem.downloadResumablePauseAsync' has been rejected.\n→ Caused by: java.io.IOException: No download object available",
          ),
        );
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
        pauseAsync,
      });
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      void worker.start([makeItem()]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.cancel();

      expect(pauseAsync).toHaveBeenCalled();
      expect(mockMarkDownloadItemCancelled).toHaveBeenCalledWith(
        'item-1',
        undefined,
      );
      expect(worker.getState()).toBe('idle');
      expect(mockWorkerLog.error).not.toHaveBeenCalled();
      expect(mockWorkerLog.info).toHaveBeenCalledWith(
        expect.stringMatching(/native download object/i),
        expect.objectContaining({ itemId: 'item-1' }),
      );
    });

    it('still error-logs genuine pauseAsync failures during cancel', async () => {
      const pauseAsync = jest
        .fn()
        .mockRejectedValue(new Error('ENOSPC: no space left on device'));
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
        pauseAsync,
      });
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      void worker.start([makeItem()]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.cancel();

      expect(mockMarkDownloadItemCancelled).toHaveBeenCalledWith(
        'item-1',
        undefined,
      );
      expect(mockWorkerLog.error).toHaveBeenCalledWith(
        'Failed to pause on cancel',
        expect.objectContaining({ itemId: 'item-1' }),
      );
    });

    it('cancel after pause reuses saved pause state without calling pauseAsync again', async () => {
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
      void worker.start([makeItem()]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.pause();
      expect(pauseAsync).toHaveBeenCalledTimes(1);

      await worker.cancel();

      expect(pauseAsync).toHaveBeenCalledTimes(1);
      expect(mockMarkDownloadItemCancelled).toHaveBeenCalledWith(
        'item-1',
        expect.stringContaining('resume-token'),
      );
      expect(worker.getState()).toBe('idle');
    });

    it('does not mark a cancelled item completed when downloadAsync settles after cancel() already reset state to idle', async () => {
      // Regression test for a race: calling pauseAsync() inside cancel()
      // can cause the in-flight downloadAsync() to settle around the same
      // time cancel() finishes and flips `state` back to 'idle'. If the
      // pending download's completion handler only checked
      // `this.state === 'cancelled'`, it could lose that race and mark a
      // cancelled item 'completed' instead of leaving it 'cancelled' — which
      // is why re-downloading it afterwards silently did nothing (#147 QA).
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

      await worker.cancel();
      expect(worker.getState()).toBe('idle');

      // Simulate the native downloadAsync() finally settling after cancel()
      // has already run to completion — the exact ordering this fix guards
      // against.
      resolveDownload({ uri: 'file:///docs/downloads/1/item-1.mp3' });
      await startPromise;

      expect(mockMarkDownloadItemCancelled).toHaveBeenCalledWith(
        'item-1',
        expect.stringContaining('resume-token'),
      );
      expect(mockMarkDownloadItemCompleted).not.toHaveBeenCalled();
    });

    it('cancel with nothing active still transitions state and clears the queue', async () => {
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      await worker.cancel();
      expect(worker.getState()).toBe('idle');
    });
  });

  describe('start guard', () => {
    it('appends via enqueueAdditional when start() is called while downloading', async () => {
      let resolveFirst!: (value: { uri: string }) => void;
      const firstPending = new Promise<{ uri: string }>(resolve => {
        resolveFirst = resolve;
      });
      jest.spyOn(FileSystem, 'createDownloadResumable').mockImplementation(
        (_url, dest) =>
          ({
            downloadAsync: jest.fn().mockImplementation(async () => {
              if (dest.includes('item-1')) {
                await firstPending;
              }
              await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
              return { uri: dest };
            }),
            pauseAsync: jest.fn(),
            resumeAsync: jest.fn(),
          } as unknown as FileSystem.DownloadResumable),
      );
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      const startPromise = worker.start([makeItem({ id: 'item-1' })]);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(worker.getState()).toBe('downloading');
      await worker.start([makeItem({ id: 'item-from-pfo' })]);

      resolveFirst({ uri: 'file:///docs/downloads/1/item-1.mp3' });
      await startPromise;

      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'item-from-pfo',
        expect.any(String),
        expect.any(Number),
      );
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

  it('prefers a freshly resolved URL over a stale saved SAS url on resume', async () => {
    const resumeAsync = jest.fn().mockImplementation(async () => {
      await FileSystem.writeAsStringAsync(
        'file:///docs/downloads/1/item-1.m4a',
        'mock-bytes',
      );
      return { uri: 'file:///docs/downloads/1/item-1.m4a' };
    });
    const createSpy = spyResumable({
      downloadAsync: jest.fn(),
      resumeAsync,
    });
    const resolver = jest.fn().mockResolvedValue({
      url: 'https://example.com/fresh-sas',
      ext: 'm4a',
    });
    const resumeData = JSON.stringify({
      url: 'https://example.com/expired-sas',
      fileUri: 'file:///docs/downloads/1/item-1.m4a',
      options: {},
      resumeData: 'resume-token',
    });

    const worker = new DownloadQueueWorker(resolver);
    await worker.start([makeItem({ status: 'paused', resumeData })]);

    expect(createSpy).toHaveBeenCalledWith(
      'https://example.com/fresh-sas',
      'file:///docs/downloads/1/item-1.m4a',
      {},
      expect.any(Function),
      'resume-token',
    );
  });

  describe('transport gate (#619)', () => {
    it('pauses an in-flight download when transport becomes blocked and does not start the next item', async () => {
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

      let transportAllowed = true;
      const resolver = jest
        .fn()
        .mockResolvedValue({ url: 'https://example.com/x.mp3', ext: 'mp3' });
      const worker = new DownloadQueueWorker(
        resolver,
        async () => transportAllowed,
      );

      const startPromise = worker.start([
        makeItem({ id: 'item-1' }),
        makeItem({ id: 'item-2' }),
      ]);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(worker.getState()).toBe('downloading');
      expect(resolver).toHaveBeenCalledTimes(1);

      transportAllowed = false;
      await worker.pause('transport');

      expect(pauseAsync).toHaveBeenCalled();
      expect(mockMarkDownloadItemPaused).toHaveBeenCalledWith(
        'item-1',
        expect.stringContaining('resume-token'),
      );
      expect(worker.getState()).toBe('paused');
      expect(worker.getPauseReason()).toBe('transport');
      expect(resolver).toHaveBeenCalledTimes(1);
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();

      resolveDownload({ uri: 'file:///docs/downloads/1/item-1.mp3' });
      await startPromise;
      expect(resolver).toHaveBeenCalledTimes(1);
    });

    it('does not start the next queued item when transport is blocked after a success', async () => {
      spyResumable();
      let transportAllowed = true;
      const resolver = jest.fn().mockImplementation(async () => {
        // After the first item resolves, block transport before item 2 starts.
        transportAllowed = false;
        return { url: 'https://example.com/x.mp3', ext: 'mp3' };
      });

      const worker = new DownloadQueueWorker(
        resolver,
        async () => transportAllowed,
      );
      await worker.start([
        makeItem({ id: 'item-1' }),
        makeItem({ id: 'item-2' }),
      ]);

      expect(resolver).toHaveBeenCalledTimes(1);
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'item-1',
        expect.any(String),
        expect.any(Number),
      );
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      expect(worker.getState()).toBe('paused');
    });

    it('promotes a transport pause to a user pause so auto-resume will not undo it', async () => {
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
      });
      const worker = new DownloadQueueWorker(
        async () => ({ url: 'https://example.com/x.mp3', ext: 'mp3' }),
        async () => true,
      );
      void worker.start([makeItem()]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.pause('transport');
      expect(worker.getPauseReason()).toBe('transport');

      await worker.pause('user');
      expect(worker.getState()).toBe('paused');
      expect(worker.getPauseReason()).toBe('user');
    });

    it('claims resume synchronously so overlapping resume() calls resume the item once', async () => {
      let resolveResume!: (value: { uri: string }) => void;
      const resumeAsync = jest.fn().mockReturnValue(
        new Promise<{ uri: string }>(resolve => {
          resolveResume = resolve;
        }),
      );
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
        resumeAsync,
      });
      const worker = new DownloadQueueWorker(
        async () => ({ url: 'https://example.com/x.mp3', ext: 'mp3' }),
        async () => true,
      );
      void worker.start([makeItem()]);
      await flushMicrotasks();
      await flushMicrotasks();
      await worker.pause('transport');

      // Two NetInfo evaluations both observe `paused` before either awaits.
      const first = worker.resume();
      const second = worker.resume();
      await flushMicrotasks();
      await flushMicrotasks();

      expect(resumeAsync).toHaveBeenCalledTimes(1);

      resolveResume({ uri: 'file:///docs/downloads/1/item-1.mp3' });
      await Promise.all([first, second]);

      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
    });

    it('rolls back to paused with the original reason when resume() finds transport still blocked', async () => {
      let transportAllowed = true;
      const resumeAsync = jest.fn().mockResolvedValue({
        uri: 'file:///docs/downloads/1/item-1.mp3',
      });
      spyResumable({
        downloadAsync: jest.fn().mockReturnValue(new Promise(() => {})),
        resumeAsync,
      });
      const worker = new DownloadQueueWorker(
        async () => ({ url: 'https://example.com/x.mp3', ext: 'mp3' }),
        async () => transportAllowed,
      );
      void worker.start([makeItem()]);
      await flushMicrotasks();
      await flushMicrotasks();
      await worker.pause('transport');

      transportAllowed = false;
      await worker.resume();

      expect(resumeAsync).not.toHaveBeenCalled();
      expect(worker.getState()).toBe('paused');
      expect(worker.getPauseReason()).toBe('transport');

      transportAllowed = true;
      await worker.resume();
      expect(resumeAsync).toHaveBeenCalledTimes(1);
    });

    it('marks paused instead of failed when a download errors while transport is blocked', async () => {
      let transportAllowed = true;
      const pauseAsync = jest.fn().mockResolvedValue({
        url: 'https://example.com/x.mp3',
        fileUri: 'file:///docs/downloads/1/item-1.mp3',
        options: {},
        resumeData: 'resume-token',
      });
      spyResumable({
        downloadAsync: jest.fn().mockImplementation(async () => {
          transportAllowed = false;
          throw new Error('Software caused connection abort');
        }),
        pauseAsync,
      });

      const worker = new DownloadQueueWorker(
        async () => ({ url: 'https://example.com/x.mp3', ext: 'mp3' }),
        async () => transportAllowed,
      );
      await worker.start([
        makeItem({ id: 'item-1' }),
        makeItem({ id: 'item-2' }),
      ]);

      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemPaused).toHaveBeenCalledWith(
        'item-1',
        expect.stringContaining('resume-token'),
      );
      expect(worker.getState()).toBe('paused');
    });
  });
});
