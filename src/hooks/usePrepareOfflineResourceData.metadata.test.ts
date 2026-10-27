import { renderHook, waitFor } from '@testing-library/react-native';
import {
  __resetPrepareOfflineReferencedParentsLatchForTests,
  usePrepareOfflineResourceData,
} from './usePrepareOfflineResourceData';
import type { PrepareOfflineChapterRow } from '../types/prepareOffline/types';
import {
  refreshChapterMetadataIfOnline,
  refreshPrepareOfflineReferencedParents,
} from '../services/sync';
import { syncPendingChapterClaimsForUser } from '../services/sync';

const mockFetch = jest.fn();
const mockContext = jest.fn();
jest.mock('../db/queries.prepareOffline', () => ({
  getPrepareOfflineProjectContext: (...args: unknown[]) => mockContext(...args),
}));
jest.mock('../services/prepareOfflineResources', () => ({
  fetchPrepareOfflineManifestsBounded: async (
    projectId: number,
    contexts: unknown[],
    signal?: AbortSignal,
  ) => {
    const items: unknown[] = [];
    for (const ctx of contexts) {
      if (signal?.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      const batch = await mockFetch(projectId, ctx);
      items.push(...batch);
    }
    return items;
  },
  refreshPrepareOfflineInventory: async () => undefined,
  subscribePrepareOfflineInventory: () => () => undefined,
  getPrepareOfflineResourceStatus: () => 'available',
  clearPrepareOfflineSessionInventory: () => undefined,
  getDefaultPrepareOfflinePackageDeselects: () => new Set(),
}));
jest.mock('../services/sync', () => ({
  refreshPrepareOfflineReferencedParents: jest.fn(async () => 'ok'),
  refreshChapterMetadataIfOnline: jest.fn(async () => undefined),
  syncPendingChapterClaimsForUser: jest.fn(async () => ({
    synced: 0,
    conflicts: 0,
    failed: 0,
  })),
}));

const repairParents =
  refreshPrepareOfflineReferencedParents as jest.MockedFunction<
    typeof refreshPrepareOfflineReferencedParents
  >;
const broadRefresh = refreshChapterMetadataIfOnline as jest.MockedFunction<
  typeof refreshChapterMetadataIfOnline
>;
const pendingClaims = syncPendingChapterClaimsForUser as jest.MockedFunction<
  typeof syncPendingChapterClaimsForUser
>;

function chapter(
  id: number,
  overrides: Partial<PrepareOfflineChapterRow> = {},
): PrepareOfflineChapterRow {
  return {
    id,
    chapterNumber: id,
    bibleId: 167,
    bookId: 40,
    bookCode: 'MAT',
    bookName: 'Matthew',
    assignedUserId: null,
    ...overrides,
  };
}

describe('usePrepareOfflineResourceData referenced-parent repair', () => {
  beforeEach(() => {
    mockFetch.mockReset().mockResolvedValue([]);
    mockContext.mockReset().mockResolvedValue({ sourceLanguageCode: 'gjk' });
    repairParents.mockClear().mockResolvedValue('ok');
    broadRefresh.mockClear();
    pendingClaims.mockClear();
    __resetPrepareOfflineReferencedParentsLatchForTests();
  });

  it('never calls broad metadata refresh or pending claims from PFO repair', async () => {
    const { result } = renderHook(() =>
      usePrepareOfflineResourceData(1, 10, [chapter(1)], new Set([1])),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(repairParents).toHaveBeenCalledWith({
      userId: 10,
      projectId: 1,
      chapters: [{ bibleId: 167, bookId: 40 }],
    });
    expect(broadRefresh).not.toHaveBeenCalled();
    expect(pendingClaims).not.toHaveBeenCalled();
  });

  it('before repair, PFO manifests use stale local gjk; after narrow ok repair, uses eng', async () => {
    // Simulate missing narrow repair (offline) — must still request gjk.
    repairParents.mockResolvedValueOnce('offline');
    mockContext.mockResolvedValue({ sourceLanguageCode: 'gjk' });

    const first = renderHook(() =>
      usePrepareOfflineResourceData(1, 10, [chapter(1)], new Set([1])),
    );
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ languageCode: 'gjk', bibleId: 167 }),
    );
    first.unmount();

    // Successful narrow repair updates local ISO before context read.
    __resetPrepareOfflineReferencedParentsLatchForTests();
    mockFetch.mockClear();
    repairParents.mockImplementation(async () => {
      mockContext.mockResolvedValue({ sourceLanguageCode: 'eng' });
      return 'ok';
    });

    const second = renderHook(() =>
      usePrepareOfflineResourceData(1, 10, [chapter(1)], new Set([1])),
    );
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ languageCode: 'eng', bibleId: 167 }),
    );
    expect(broadRefresh).not.toHaveBeenCalled();
    expect(pendingClaims).not.toHaveBeenCalled();
  });

  it('does not latch offline/failure — retries repair on next load', async () => {
    repairParents.mockResolvedValueOnce('offline');

    const first = renderHook(() =>
      usePrepareOfflineResourceData(1, 10, [chapter(1)], new Set([1])),
    );
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(repairParents).toHaveBeenCalledTimes(1);
    first.unmount();

    repairParents.mockResolvedValueOnce('failed');
    const second = renderHook(() =>
      usePrepareOfflineResourceData(1, 10, [chapter(1)], new Set([1])),
    );
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(repairParents).toHaveBeenCalledTimes(2);
    second.unmount();

    repairParents.mockResolvedValueOnce('ok');
    const third = renderHook(() =>
      usePrepareOfflineResourceData(1, 10, [chapter(1)], new Set([1])),
    );
    await waitFor(() => expect(third.result.current.loading).toBe(false));
    expect(repairParents).toHaveBeenCalledTimes(3);

    // Latched after ok — chapter toggle with same bible/book set does not re-repair.
    mockFetch.mockClear();
    const { rerender, result } = renderHook(
      ({ selected }: { selected: Set<number> }) =>
        usePrepareOfflineResourceData(
          1,
          10,
          [chapter(1), chapter(2)],
          selected,
        ),
      { initialProps: { selected: new Set([1]) } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsAfterMount = repairParents.mock.calls.length;
    rerender({ selected: new Set([1, 2]) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(repairParents.mock.calls.length).toBe(callsAfterMount);
  });

  it('re-repairs when a later selection introduces a new bible/book id set', async () => {
    repairParents.mockResolvedValue('ok');

    const { rerender, result } = renderHook(
      ({
        chapters,
        selected,
      }: {
        chapters: PrepareOfflineChapterRow[];
        selected: Set<number>;
      }) => usePrepareOfflineResourceData(1, 10, chapters, selected),
      {
        initialProps: {
          chapters: [chapter(1), chapter(2)],
          selected: new Set([1]),
        },
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(repairParents).toHaveBeenCalledTimes(1);
    expect(repairParents).toHaveBeenLastCalledWith({
      userId: 10,
      projectId: 1,
      chapters: [{ bibleId: 167, bookId: 40 }],
    });

    rerender({
      chapters: [
        chapter(1),
        chapter(2, {
          bibleId: 200,
          bookId: 41,
          bookCode: 'MRK',
          bookName: 'Mark',
        }),
      ],
      selected: new Set([1, 2]),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(repairParents).toHaveBeenCalledTimes(2);
    expect(repairParents).toHaveBeenLastCalledWith({
      userId: 10,
      projectId: 1,
      chapters: [
        { bibleId: 167, bookId: 40 },
        { bibleId: 200, bookId: 41 },
      ],
    });
  });

  it('does not latch when the hook cancels during pending repair', async () => {
    let resolveRepair!: (
      value: 'ok' | 'offline' | 'skipped' | 'failed',
    ) => void;
    repairParents.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRepair = resolve;
        }),
    );

    const first = renderHook(() =>
      usePrepareOfflineResourceData(1, 10, [chapter(1)], new Set([1])),
    );
    await waitFor(() => expect(repairParents).toHaveBeenCalledTimes(1));
    first.unmount();
    resolveRepair('ok');

    // Same refs after cancel — must repair again (latch was not written).
    repairParents.mockResolvedValue('ok');
    const second = renderHook(() =>
      usePrepareOfflineResourceData(1, 10, [chapter(1)], new Set([1])),
    );
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(repairParents).toHaveBeenCalledTimes(2);
  });
});
