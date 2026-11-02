import { renderHook, waitFor } from '@testing-library/react-native';
import { usePrepareOfflineResourceData } from './usePrepareOfflineResourceData';
import type { PrepareOfflineChapterRow } from '../types/prepareOffline/types';
import { ApiError } from '../types/api/errors';

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
}));
jest.mock('../services/sync', () => ({
  refreshPrepareOfflineReferencedParents: jest.fn(async () => 'ok'),
  refreshChapterMetadataIfOnline: jest.fn(async () => undefined),
  syncPendingChapterClaimsForUser: jest.fn(),
}));

const chapters: PrepareOfflineChapterRow[] = Array.from(
  { length: 49 },
  (_, i) => ({
    id: i + 1,
    chapterNumber: i + 1,
    bibleId: 10,
    bookId: 1,
    bookCode: 'GEN',
    bookName: 'Genesis',
    assignedUserId: null,
  }),
);

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue([]);
  mockContext.mockReset().mockResolvedValue({ sourceLanguageCode: 'eng' });
});

it.each([21, 49])(
  'accepts %i selected chapters with complete empty responses',
  async count => {
    const { result } = renderHook(() =>
      usePrepareOfflineResourceData(
        12,
        10,
        chapters,
        new Set(chapters.slice(0, count).map(ch => ch.id)),
      ),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    // Canonical contexts stay max-20 contiguous chunks (network split is internal).
    expect(mockFetch).toHaveBeenCalledTimes(Math.ceil(count / 20));
    expect(result.current.manifestContexts).toHaveLength(Math.ceil(count / 20));
  },
);

it.each([401, 403, 502, 0])(
  'retains HTTP %i failures and clears the whole catalog',
  async status => {
    const error = new ApiError(status, 'fixture', 'fixture');
    mockFetch.mockRejectedValueOnce(error);
    const { result } = renderHook(() =>
      usePrepareOfflineResourceData(12, 10, chapters, new Set([1])),
    );
    await waitFor(() => expect(result.current.error).toBe(error));
    expect(result.current.loading).toBe(false);
    expect(result.current.manifest).toEqual([]);
    expect(result.current.manifestContexts).toEqual([]);
  },
);

it('distinguishes missing local project context from a manifest request failure', async () => {
  mockContext.mockResolvedValue(null);
  const { result } = renderHook(() =>
    usePrepareOfflineResourceData(12, 10, chapters, new Set([1])),
  );
  await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  expect(mockFetch).not.toHaveBeenCalled();
  expect(result.current.loading).toBe(false);
});

it('recovers on a changed selection after a failed request', async () => {
  mockFetch.mockRejectedValueOnce(new ApiError(502, 'fixture', 'fixture'));
  const { result, rerender } = renderHook(
    ({ selected }: { selected: Set<number> }) =>
      usePrepareOfflineResourceData(12, 10, chapters, selected),
    { initialProps: { selected: new Set([1]) } },
  );
  await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
  rerender({ selected: new Set([2]) });
  await waitFor(() => expect(result.current.error).toBeNull());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.manifestContexts[0].startChapter).toBe(2);
});

it('keeps canonical MAT contexts as contiguous max-20 ranges', async () => {
  const matthew = chapters.slice(0, 28).map(ch => ({
    ...ch,
    bookCode: 'MAT',
    bookName: 'Mathew',
    bookId: 40,
  }));
  const { result } = renderHook(() =>
    usePrepareOfflineResourceData(
      12,
      10,
      matthew,
      new Set(matthew.map(ch => ch.id)),
    ),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.manifestContexts).toEqual([
    {
      languageCode: 'eng',
      bookCode: 'MAT',
      bookId: 40,
      bibleId: 10,
      startChapter: 1,
      endChapter: 20,
    },
    {
      languageCode: 'eng',
      bookCode: 'MAT',
      bookId: 40,
      bibleId: 10,
      startChapter: 21,
      endChapter: 28,
    },
  ]);
  expect(mockFetch.mock.calls.map(call => call[1])).toEqual(
    result.current.manifestContexts,
  );
});

it('a failure in a different selected book clears successful Matthew results too', async () => {
  const matthew = { ...chapters[0], bookCode: 'MAT', bookId: 40 };
  const psalm = { ...chapters[1], bookCode: 'PSA', bookId: 19 };
  const error = new ApiError(502, 'fixture', 'fixture');
  mockFetch.mockImplementation((_projectId, context) =>
    context.bookCode === 'PSA' ? Promise.reject(error) : Promise.resolve([]),
  );
  const { result } = renderHook(() =>
    usePrepareOfflineResourceData(12, 10, [matthew, psalm], new Set([1, 2])),
  );
  await waitFor(() => expect(result.current.error).toBe(error));
  expect(mockFetch).toHaveBeenCalled();
  expect(result.current.manifest).toEqual([]);
  expect(result.current.manifestContexts).toEqual([]);
});

it('aborts in-flight selection load and does not surface abort as a catalog error', async () => {
  let resolveFetch: ((value: unknown[]) => void) | undefined;
  mockFetch.mockImplementation(
    () =>
      new Promise(resolve => {
        resolveFetch = resolve;
      }),
  );
  const first = renderHook(() =>
    usePrepareOfflineResourceData(12, 10, chapters, new Set([1, 2, 3])),
  );
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  first.unmount();
  resolveFetch?.([]);

  mockFetch.mockClear().mockResolvedValue([]);
  const second = renderHook(() =>
    usePrepareOfflineResourceData(12, 10, chapters, new Set([1])),
  );
  await waitFor(() => expect(second.result.current.loading).toBe(false));
  expect(second.result.current.error).toBeNull();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[0][1]).toMatchObject({
    startChapter: 1,
    endChapter: 1,
  });
});
