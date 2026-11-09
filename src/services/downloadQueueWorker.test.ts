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
const mockClearDownloadItemResumeState = jest.fn().mockResolvedValue(undefined);

jest.mock('../db/downloadQueueRepository', () => ({
  clearDownloadItemResumeState: (...args: unknown[]) =>
    mockClearDownloadItemResumeState(...args),

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

/** Real Expo results always carry status + headers; download validation relies on them. */
function ok(uri: string, status = 200) {
  return { uri, status, headers: {} as Record<string, string> };
}

/**
 * Realistic 206 for the mock resume: the mock writes the whole 10-byte body
 * ('mock-bytes') from offset 0 (no prior partial file in these fixtures).
 */
function okResumed(uri: string, start = 0, total = 10) {
  return {
    uri,
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${total - 1}/${total}`,
    } as Record<string, string>,
  };
}

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
          return ok(dest);
        }),
        pauseAsync: jest.fn().mockResolvedValue({
          url: 'https://example.com/x.mp3',
          fileUri: dest,
          options: {},
          resumeData: 'resume-token',
        }),
        resumeAsync: jest.fn().mockImplementation(async () => {
          await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
          return okResumed(dest);
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
    let resolveFirst!: (value: ReturnType<typeof ok>) => void;
    const firstPending = new Promise<ReturnType<typeof ok>>(resolve => {
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
              return ok(dest);
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
    resolveFirst(ok('file:///docs/downloads/1/item-1.mp3'));
    await startPromise;

    expect(createSpy).toHaveBeenCalled();
    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'item-2',
      expect.any(String),
      expect.any(Number),
    );
  });

  it('dropItems during deferred resolver cancels shifted item; re-enqueue completes once', async () => {
    let resolveDraft!: (value: { url: string; ext: string }) => void;
    const draftResolverPending = new Promise<{ url: string; ext: string }>(
      resolve => {
        resolveDraft = resolve;
      },
    );
    let draftResolveCount = 0;
    const resolver = jest
      .fn()
      .mockImplementation(async (item: DownloadQueueItem) => {
        if (item.id === 'draft-resolving') {
          draftResolveCount += 1;
          if (draftResolveCount === 1) {
            return draftResolverPending;
          }
          return { url: 'https://example.com/draft-retry.mp3', ext: 'mp3' };
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
      { signal: expect.any(AbortSignal) },
    );
    expect(createSpy).not.toHaveBeenCalled();

    // Stage-exit purge while resolver is still pending — active is null.
    await worker.dropItems(['draft-resolving']);
    worker.enqueueAdditional([
      makeItem({ id: 'draft-resolving', label: 'Draft audio' }),
    ]);

    // Stale first resolver result must not complete the dropped claim.
    resolveDraft({ url: 'https://example.com/draft.mp3', ext: 'mp3' });
    await startPromise;
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'pfo-unrelated',
      expect.any(String),
      expect.any(Number),
    );
    const completedIds = mockMarkDownloadItemCompleted.mock.calls.map(
      call => call[0],
    );
    expect(completedIds.filter(id => id === 'draft-resolving')).toHaveLength(1);
    expect(completedIds).toContain('pfo-unrelated');
    // First (cancelled) resolver must not be the completion path; second run completes.
    expect(draftResolveCount).toBeGreaterThanOrEqual(2);
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
    let resolveDownload!: (value: ReturnType<typeof ok>) => void;
    const pending = new Promise<ReturnType<typeof ok>>(resolve => {
      resolveDownload = resolve;
    });
    jest.spyOn(FileSystem, 'createDownloadResumable').mockImplementation(
      (_url, dest) =>
        ({
          downloadAsync: jest.fn().mockImplementation(async () => {
            await pending;
            await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
            return ok(dest);
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
    resolveDownload(ok('file:///docs/downloads/1/item-1.mp3'));
    await startPromise;
  });

  it('downloads image rows as binary even when serializedContent is present', async () => {
    spyResumable();
    const resolver = jest
      .fn()
      .mockResolvedValue({ url: 'https://example.com/img.png', ext: 'png' });

    const worker = new DownloadQueueWorker(resolver);
    await worker.start([
      makeItem({
        id: 'ref-img-1',
        kind: 'image',
        resourceName: 'Reference Images',
        label: 'Genesis 1',
        fileExt: 'png',
        serializedContent: '<svg />',
      }),
    ]);

    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ref-img-1', kind: 'image' }),
      { signal: expect.any(AbortSignal) },
    );
    expect(mockDownloadResourcePath).toHaveBeenCalledWith(
      1,
      'ref-img-1',
      'png',
    );
    expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
      'ref-img-1',
      'file:///docs/downloads/1/ref-img-1.png',
      expect.any(Number),
    );
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
      { signal: expect.any(AbortSignal) },
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

  describe('result validation (#886)', () => {
    const dest = 'file:///docs/downloads/1/item-1.mp3';

    it('does not publish a 403 error body as a completed download; re-resolves once, then fails', async () => {
      const downloadAsync = jest.fn().mockImplementation(async () => {
        await FileSystem.writeAsStringAsync(dest, '<Error>Expired</Error>');
        return {
          uri: dest,
          status: 403,
          headers: { 'content-type': 'application/xml' },
        };
      });
      spyResumable({ downloadAsync });
      const resolver = jest
        .fn()
        .mockResolvedValueOnce({ url: 'https://s3/x?sig=old', ext: 'mp3' })
        .mockResolvedValueOnce({ url: 'https://s3/x?sig=new', ext: 'mp3' });

      const worker = new DownloadQueueWorker(resolver);
      await worker.start([makeItem({ kind: 'audio' })]);

      // Fresh URL requested exactly once after the rejected body.
      expect(resolver).toHaveBeenCalledTimes(2);
      expect(downloadAsync).toHaveBeenCalledTimes(2);
      expect(mockClearDownloadItemResumeState).toHaveBeenCalledWith('item-1');
      expect(mockMarkDownloadItemCompleted).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemFailed).toHaveBeenCalledTimes(1);
      // Rejected bytes are never left on disk.
      expect((await FileSystem.getInfoAsync(dest)).exists).toBe(false);
      expect(worker.getState()).toBe('idle');
    });

    it('restarts from scratch when the server ignores Range on resume, then completes', async () => {
      // Partial bytes on disk from a previous session.
      await FileSystem.writeAsStringAsync(dest, 'part');
      const resumeAsync = jest.fn().mockImplementation(async () => {
        // Server ignored Range: full 200 body appended onto the partial.
        await FileSystem.writeAsStringAsync(dest, 'part' + 'mock-bytes');
        return { uri: dest, status: 200, headers: { 'content-length': '10' } };
      });
      const downloadAsync = jest.fn().mockImplementation(async () => {
        await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
        return { uri: dest, status: 200, headers: { 'content-length': '10' } };
      });
      spyResumable({ downloadAsync, resumeAsync });

      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      await worker.start([
        makeItem({
          kind: 'audio',
          resourceName: 'Draft Chapter',
          bytesTotal: 10,
          localFilePath: dest,
          resumeData: JSON.stringify({ fileUri: dest, resumeData: '4' }),
        }),
      ]);

      expect(resumeAsync).toHaveBeenCalledTimes(1);
      expect(downloadAsync).toHaveBeenCalledTimes(1);
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'item-1',
        dest,
        10,
      );
    });

    it('accepts a resumed 206 whose Content-Range matches the local offset and expected total', async () => {
      await FileSystem.writeAsStringAsync(dest, 'part');
      const resumeAsync = jest.fn().mockImplementation(async () => {
        await FileSystem.writeAsStringAsync(dest, 'part' + 'mock-b');
        return {
          uri: dest,
          status: 206,
          headers: { 'content-range': 'bytes 4-9/10', 'content-length': '6' },
        };
      });
      spyResumable({ downloadAsync: jest.fn(), resumeAsync });

      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      await worker.start([
        makeItem({
          kind: 'audio',
          resourceName: 'Draft Chapter',
          bytesTotal: 10,
          localFilePath: dest,
          resumeData: JSON.stringify({ fileUri: dest, resumeData: '4' }),
        }),
      ]);

      expect(mockClearDownloadItemResumeState).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'item-1',
        dest,
        10,
      );
    });

    it('rejects a size mismatch against the manifest and an HTML body for audio', async () => {
      const downloadAsync = jest
        .fn()
        .mockImplementationOnce(async () => {
          await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
          return {
            uri: dest,
            status: 200,
            headers: { 'content-length': '10' },
          };
        })
        .mockImplementationOnce(async () => {
          await FileSystem.writeAsStringAsync(dest, '<html>captive</html>');
          return {
            uri: dest,
            status: 200,
            headers: { 'content-type': 'text/html' },
          };
        });
      spyResumable({ downloadAsync });

      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      // Draft take says 12 bytes (exact); both attempts are rejected.
      await worker.start([
        makeItem({
          kind: 'audio',
          resourceName: 'Draft Chapter',
          bytesTotal: 12,
        }),
      ]);

      expect(downloadAsync).toHaveBeenCalledTimes(2);
      expect(mockMarkDownloadItemCompleted).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemFailed).toHaveBeenCalledWith('item-1');
      expect(mockWorkerLog.warn).toHaveBeenCalledWith(
        'Download result rejected',
        expect.objectContaining({
          reason: 'restart: Content-Length 10 != expected 12',
        }),
      );
      expect(mockWorkerLog.warn).toHaveBeenCalledWith(
        'Download result rejected',
        expect.objectContaining({
          reason: 'restart: non-audio body (text/html)',
        }),
      );
    });

    it('does not count a clean restart against a different item', async () => {
      let call = 0;
      jest.spyOn(FileSystem, 'createDownloadResumable').mockImplementation(
        (_url, destPath) =>
          ({
            downloadAsync: jest.fn().mockImplementation(async () => {
              call += 1;
              if (call === 1) {
                await FileSystem.writeAsStringAsync(destPath, 'oops');
                return { uri: destPath, status: 403, headers: {} };
              }
              await FileSystem.writeAsStringAsync(destPath, 'mock-bytes');
              return { uri: destPath, status: 200, headers: {} };
            }),
            pauseAsync: jest.fn(),
            resumeAsync: jest.fn(),
          } as unknown as FileSystem.DownloadResumable),
      );

      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      await worker.start([
        makeItem({ id: 'item-1', kind: 'audio' }),
        makeItem({ id: 'item-2', kind: 'audio' }),
      ]);

      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledTimes(2);
    });

    it('rejects a same-size audio body whose digest differs from the manifest', async () => {
      spyResumable();
      const resolver = jest.fn(
        async (
          _item: DownloadQueueItem,
          _options?: { forceRefresh?: boolean },
        ) => ({
          url: 'https://example.test/audio',
          ext: 'm4a',
          expectedBytes: 10,
        }),
      );
      const worker = new DownloadQueueWorker(resolver);
      await worker.start([
        makeItem({
          serializedContent: JSON.stringify({
            expectedContentHash: 'a'.repeat(64),
          }),
        }),
      ]);
      expect(mockMarkDownloadItemCompleted).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemFailed).toHaveBeenCalledTimes(1);
      expect(resolver).toHaveBeenCalledTimes(2);
      expect(resolver.mock.calls[1]?.[1]).toMatchObject({ forceRefresh: true });
    });

    it('does not enforce advisory catalogue sizes (non-draft items) against the response', async () => {
      spyResumable({
        downloadAsync: jest.fn().mockImplementation(async () => {
          await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
          return {
            uri: dest,
            status: 200,
            headers: { 'content-length': '10' },
          };
        }),
      });
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      // Aquifer-advertised size differs from what the CDN actually serves.
      await worker.start([makeItem({ kind: 'audio', bytesTotal: 123456 })]);

      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'item-1',
        dest,
        10,
      );
    });

    it('fails a 5xx immediately without spending a restart', async () => {
      const downloadAsync = jest.fn().mockImplementation(async () => {
        await FileSystem.writeAsStringAsync(dest, 'Internal Server Error');
        return { uri: dest, status: 500, headers: {} };
      });
      spyResumable({ downloadAsync });
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      await worker.start([makeItem({ kind: 'audio' })]);

      expect(downloadAsync).toHaveBeenCalledTimes(1);
      expect(mockClearDownloadItemResumeState).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemFailed).toHaveBeenCalledWith('item-1');
      expect((await FileSystem.getInfoAsync(dest)).exists).toBe(false);
    });

    it('restarts a rejected result that came through resume()', async () => {
      const downloadAsync = jest
        .fn()
        .mockReturnValueOnce(new Promise(() => {}))
        .mockImplementationOnce(async () => {
          await FileSystem.writeAsStringAsync(dest, 'mock-bytes');
          return { uri: dest, status: 200, headers: {} };
        });
      const resumeAsync = jest.fn().mockImplementation(async () => {
        await FileSystem.writeAsStringAsync(dest, '<Error>Expired</Error>');
        return { uri: dest, status: 403, headers: {} };
      });
      spyResumable({ downloadAsync, resumeAsync });
      const worker = new DownloadQueueWorker(
        async () => ({ url: 'https://example.com/x.mp3', ext: 'mp3' }),
        async () => true,
      );
      void worker.start([makeItem({ kind: 'audio' })]);
      await flushMicrotasks();
      await flushMicrotasks();
      await worker.pause('transport');
      await worker.resume();
      await flushMicrotasks();
      await flushMicrotasks();

      expect(resumeAsync).toHaveBeenCalledTimes(1);
      expect(mockClearDownloadItemResumeState).toHaveBeenCalledWith('item-1');
      expect(downloadAsync).toHaveBeenCalledTimes(2);
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'item-1',
        dest,
        10,
      );
    });

    it('does not re-queue or write when cancel() lands during a restart', async () => {
      let releaseDelete!: () => void;
      const deleteGate = new Promise<void>(resolve => {
        releaseDelete = resolve;
      });
      const deleteSpy = jest
        .spyOn(FileSystem, 'deleteAsync')
        .mockImplementation(async () => {
          await deleteGate;
        });
      const createSpy = spyResumable({
        downloadAsync: jest.fn().mockImplementation(async () => {
          await FileSystem.writeAsStringAsync(dest, 'oops');
          return { uri: dest, status: 403, headers: {} };
        }),
      });
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      const run = worker.start([makeItem({ kind: 'audio' })]);
      await flushMicrotasks();
      await flushMicrotasks();
      // restartOrFail is now blocked inside deleteAsync; user cancels.
      await worker.cancel();
      releaseDelete();
      await run;
      deleteSpy.mockRestore();

      expect(mockMarkDownloadItemCancelled).toHaveBeenCalledWith(
        'item-1',
        expect.anything(),
      );
      expect(mockClearDownloadItemResumeState).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(worker.getState()).toBe('idle');
    });

    it('does not resurrect a dropped item when dropItems() lands during a restart', async () => {
      let releaseDelete!: () => void;
      const deleteGate = new Promise<void>(resolve => {
        releaseDelete = resolve;
      });
      const deleteSpy = jest
        .spyOn(FileSystem, 'deleteAsync')
        .mockImplementation(async () => {
          await deleteGate;
        });
      let attempts = 0;
      const createSpy = jest
        .spyOn(FileSystem, 'createDownloadResumable')
        .mockImplementation(
          (_url, destPath) =>
            ({
              downloadAsync: jest.fn().mockImplementation(async () => {
                attempts += 1;
                if (destPath === dest) {
                  await FileSystem.writeAsStringAsync(destPath, 'oops');
                  return { uri: destPath, status: 403, headers: {} };
                }
                await FileSystem.writeAsStringAsync(destPath, 'mock-bytes');
                return { uri: destPath, status: 200, headers: {} };
              }),
              pauseAsync: jest.fn().mockResolvedValue({
                url: 'https://example.com/x.mp3',
                fileUri: destPath,
                options: {},
                resumeData: 'r',
              }),
              resumeAsync: jest.fn(),
            } as unknown as FileSystem.DownloadResumable),
        );
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.mp3',
        ext: 'mp3',
      }));
      const run = worker.start([
        makeItem({ id: 'item-1', kind: 'audio' }),
        makeItem({ id: 'item-2', kind: 'audio' }),
      ]);
      await flushMicrotasks();
      await flushMicrotasks();
      // item-1 is mid-restart (blocked in deleteAsync); it gets purged.
      await worker.dropItems(['item-1']);
      releaseDelete();
      await run;
      await flushMicrotasks();
      deleteSpy.mockRestore();

      expect(mockClearDownloadItemResumeState).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      // item-1 never came back: only item-2 completed, exactly once.
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledTimes(1);
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'item-2',
        expect.any(String),
        expect.any(Number),
      );
      expect(createSpy.mock.calls.filter(c => c[1] === dest)).toHaveLength(1);
      expect(attempts).toBe(2);
    });

    it('marks an inline text item failed (no restart) when the local write produced nothing', async () => {
      const writeSpy = jest
        .spyOn(FileSystem, 'writeAsStringAsync')
        .mockResolvedValue(undefined);
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.com/x.json',
        ext: 'json',
      }));
      await worker.start([
        makeItem({ kind: 'text', serializedContent: '{"type":"doc"}' }),
      ]);
      writeSpy.mockRestore();

      expect(mockMarkDownloadItemCompleted).not.toHaveBeenCalled();
      expect(mockClearDownloadItemResumeState).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemFailed).toHaveBeenCalledWith('item-1');
      expect(worker.getState()).toBe('idle');
    });
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
          downloadAsync: jest.fn().mockResolvedValue(ok(dest)),
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
      let resolveDownload!: (value: ReturnType<typeof ok>) => void;
      const pending = new Promise<ReturnType<typeof ok>>(resolve => {
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

      resolveDownload(ok('file:///docs/downloads/1/item-1.mp3'));
      await startPromise;
    });

    it('resume continues the active resumable and completes the item', async () => {
      const resumeAsync = jest.fn().mockImplementation(async () => {
        await FileSystem.writeAsStringAsync(
          'file:///docs/downloads/1/item-1.mp3',
          'mock-bytes',
        );
        return okResumed('file:///docs/downloads/1/item-1.mp3');
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

    it('does not start a persisted resume after cancellation wins during file stat', async () => {
      let release!: (value: FileSystem.FileInfo) => void;
      const stat = jest.spyOn(FileSystem, 'getInfoAsync').mockReturnValue(
        new Promise(resolve => {
          release = resolve;
        }),
      );
      const resumeAsync = jest.fn().mockResolvedValue(null);
      spyResumable({
        resumeAsync,
        pauseAsync: jest
          .fn()
          .mockRejectedValue(new Error('No download object available')),
      });
      const worker = new DownloadQueueWorker(async () => ({
        url: 'https://example.test/audio',
        ext: 'm4a',
      }));
      const running = worker.start([
        makeItem({
          status: 'paused',
          resumeData: JSON.stringify({ resumeData: '4' }),
        }),
      ]);
      await flushMicrotasks();
      expect(stat).toHaveBeenCalled();
      await worker.cancel();
      release({
        exists: true,
        isDirectory: false,
        size: 4,
        uri: 'file:///a',
        modificationTime: 1,
      });
      await running;
      expect(resumeAsync).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).not.toHaveBeenCalled();
      stat.mockRestore();
    });

    it('does not mark a cancelled item failed when resumeAsync rejects after cancel()', async () => {
      // Mirror processNext(): if cancel() runs while resumeAsync() is in flight
      // and then rejects, the catch must not overwrite 'cancelled' with 'failed'.
      let rejectResume!: (reason?: unknown) => void;
      const pendingResume = new Promise<ReturnType<typeof ok>>((_, reject) => {
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
      let resolveDownload!: (value: ReturnType<typeof ok>) => void;
      const pending = new Promise<ReturnType<typeof ok>>(resolve => {
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
      resolveDownload(ok('file:///docs/downloads/1/item-1.mp3'));
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
      return okResumed('file:///docs/downloads/1/item-1.mp3');
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
      return okResumed('file:///docs/downloads/1/item-1.m4a');
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
      let resolveDownload!: (value: ReturnType<typeof ok>) => void;
      const pending = new Promise<ReturnType<typeof ok>>(resolve => {
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

      resolveDownload(ok('file:///docs/downloads/1/item-1.mp3'));
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
      let resolveResume!: (value: ReturnType<typeof ok>) => void;
      const resumeAsync = jest.fn().mockReturnValue(
        new Promise<ReturnType<typeof ok>>(resolve => {
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

      await FileSystem.writeAsStringAsync(
        'file:///docs/downloads/1/item-1.mp3',
        'mock-bytes',
      );
      resolveResume(okResumed('file:///docs/downloads/1/item-1.mp3'));
      await Promise.all([first, second]);

      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
    });

    it('rolls back to paused with the original reason when resume() finds transport still blocked', async () => {
      let transportAllowed = true;
      const resumeAsync = jest.fn().mockImplementation(async () => {
        await FileSystem.writeAsStringAsync(
          'file:///docs/downloads/1/item-1.mp3',
          'mock-bytes',
        );
        return okResumed('file:///docs/downloads/1/item-1.mp3');
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

  describe('resolver cancellation (#886)', () => {
    /** Resolver that rejects with AbortError when its signal fires. */
    const abortableResolver = () => {
      let signalSeen: AbortSignal | undefined;
      const resolver = jest.fn().mockImplementation(
        (_item: DownloadQueueItem, options?: { signal?: AbortSignal }) =>
          new Promise<{ url: string; ext: string }>((resolve, reject) => {
            signalSeen = options?.signal;
            options?.signal?.addEventListener('abort', () => {
              const error = new Error('Request aborted');
              error.name = 'AbortError';
              reject(error);
            });
            // Never resolves unless aborted — models a hung URL refresh.
            void resolve;
          }),
      );
      return { resolver, signal: () => signalSeen };
    };

    it('pause() aborts an in-flight URL refresh and re-queues the item instead of failing it', async () => {
      const { resolver, signal } = abortableResolver();
      const worker = new DownloadQueueWorker(resolver);
      const startPromise = worker.start([makeItem({ id: 'hung-refresh' })]);
      await flushMicrotasks();
      await flushMicrotasks();
      expect(signal()?.aborted).toBe(false);

      await worker.pause();
      await startPromise;
      await flushMicrotasks();

      expect(signal()?.aborted).toBe(true);
      expect(worker.getState()).toBe('paused');
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();

      // Resume re-runs the resolver for the same item (it was re-queued).
      resolver.mockResolvedValueOnce({
        url: 'https://example.com/a.mp3',
        ext: 'mp3',
      });
      await worker.resume();
      await flushMicrotasks();
      await flushMicrotasks();
      expect(resolver).toHaveBeenCalledTimes(2);
      expect(resolver).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'hung-refresh' }),
        { signal: expect.any(AbortSignal) },
      );
    });

    it('resume() before the aborted refresh settles does not strand the re-queued item', async () => {
      // Abort rejection is released manually so resume() can run first.
      let release: (() => void) | undefined;
      const resolver = jest
        .fn()
        .mockImplementationOnce(
          (_item: DownloadQueueItem, options?: { signal?: AbortSignal }) =>
            new Promise<{ url: string; ext: string }>((_resolve, reject) => {
              options?.signal?.addEventListener('abort', () => {
                release = () => {
                  const error = new Error('Request aborted');
                  error.name = 'AbortError';
                  reject(error);
                };
              });
            }),
        )
        .mockResolvedValueOnce({
          url: 'https://example.com/a.mp3',
          ext: 'mp3',
        });
      spyResumable();
      const worker = new DownloadQueueWorker(resolver);
      const startPromise = worker.start([makeItem({ id: 'hung-refresh' })]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.pause();
      expect(worker.getState()).toBe('paused');
      // Resume lands while the aborted refresh is still unwinding.
      await worker.resume();
      await flushMicrotasks();
      expect(worker.getState()).toBe('downloading');
      // resume() must defer to the unwinding claim, not start a second pass.
      expect(resolver).toHaveBeenCalledTimes(1);

      release?.();
      await startPromise;
      await flushMicrotasks();
      await flushMicrotasks();

      // The unwinding claim re-queued the item and drove the queue itself.
      expect(resolver).toHaveBeenCalledTimes(2);
      expect(resolver).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'hung-refresh' }),
        { signal: expect.any(AbortSignal) },
      );
      // It ran to completion through the mocked transfer — not left behind
      // in an idle worker's queue.
      await flushMicrotasks();
      expect(mockMarkDownloadItemCompleted).toHaveBeenCalledWith(
        'hung-refresh',
        expect.any(String),
        expect.any(Number),
      );
      expect(worker.getState()).toBe('idle');
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
    });

    it('cancel() after resume() but before the aborted refresh settles ends idle without failing the item', async () => {
      let release: (() => void) | undefined;
      const resolver = jest.fn().mockImplementationOnce(
        (_item: DownloadQueueItem, options?: { signal?: AbortSignal }) =>
          new Promise<{ url: string; ext: string }>((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              release = () => {
                const error = new Error('Request aborted');
                error.name = 'AbortError';
                reject(error);
              };
            });
          }),
      );
      const worker = new DownloadQueueWorker(resolver);
      const startPromise = worker.start([makeItem({ id: 'hung-refresh' })]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.pause();
      await worker.resume();
      await worker.cancel();
      release?.();
      await startPromise;
      await flushMicrotasks();

      expect(resolver).toHaveBeenCalledTimes(1);
      expect(worker.getState()).toBe('idle');
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).not.toHaveBeenCalled();
    });

    it('cancel() aborts an in-flight URL refresh and does not mark the item failed', async () => {
      const { resolver, signal } = abortableResolver();
      const worker = new DownloadQueueWorker(resolver);
      const startPromise = worker.start([makeItem({ id: 'hung-refresh' })]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.cancel();
      await startPromise;
      await flushMicrotasks();

      expect(signal()?.aborted).toBe(true);
      expect(worker.getState()).toBe('idle');
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
      expect(mockMarkDownloadItemCompleted).not.toHaveBeenCalled();
    });

    it('dropItems() aborts the refresh for the dropped id only', async () => {
      const { resolver, signal } = abortableResolver();
      const worker = new DownloadQueueWorker(resolver);
      const startPromise = worker.start([
        makeItem({ id: 'hung-refresh' }),
        makeItem({ id: 'other', tier: 2 }),
      ]);
      await flushMicrotasks();
      await flushMicrotasks();

      await worker.dropItems(['unrelated-id']);
      expect(signal()?.aborted).toBe(false);

      await worker.dropItems(['hung-refresh']);
      expect(signal()?.aborted).toBe(true);
      await worker.cancel();
      await startPromise;
      expect(mockMarkDownloadItemFailed).not.toHaveBeenCalled();
    });
  });
});
