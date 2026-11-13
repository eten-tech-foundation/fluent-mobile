import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMilestoneChapters } from './useMilestoneChapters';
import { getMilestoneChapters } from '../db/queries';
import { isUserProjectMember } from '../db/repository';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { parseUserId } from '../utils/parseUserId';
import type { ProjectChapter } from '../types/db/types';

jest.mock('../db/queries', () => ({
  getMilestoneChapters: jest.fn(),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(),
}));

// Breaks the real import chain (services/storage -> @op-engineering/op-sqlite,
// which is ESM and not in transformIgnorePatterns), and keeps the
// metadata-refresh useFocusEffect a no-op for tests that aren't about it.
jest.mock('../services/sync', () => ({
  refreshChapterMetadataIfOnline: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../db/repository', () => ({
  isUserProjectMember: jest.fn().mockResolvedValue(true),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn().mockReturnValue(null),
}));

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (cb: () => void) => {
      useEffect(() => {
        cb();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
  };
});

const mockGetMilestoneChapters = getMilestoneChapters as jest.Mock;
const mockParseUserId = parseUserId as jest.Mock;
const mockGetActiveUserId = getActiveUserId as jest.Mock;
const mockRefreshChapterMetadataIfOnline =
  refreshChapterMetadataIfOnline as jest.MockedFunction<
    typeof refreshChapterMetadataIfOnline
  >;
const mockIsUserProjectMember = isUserProjectMember as jest.MockedFunction<
  typeof isUserProjectMember
>;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeChapter(overrides: Partial<ProjectChapter> = {}): ProjectChapter {
  return {
    id: 1,
    displayLabel: 'Mark 1',
    bookName: 'Mark',
    chapterNumber: 1,
    workflowStage: 'draft',
    syncState: 'synced',
    ownershipState: 'mine',
    completedVerses: 0,
    totalVerses: 10,
    downloadedVerses: 10,
    hasConflict: false,
    ...overrides,
  };
}

describe('useMilestoneChapters', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockParseUserId.mockReturnValue(1);
    mockGetActiveUserId.mockReturnValue(null);
    mockRefreshChapterMetadataIfOnline.mockResolvedValue(undefined);
    mockIsUserProjectMember.mockResolvedValue(true);
  });

  it('keeps the newer result when an older, slower request resolves last', async () => {
    const staleChapters = [makeChapter({ id: 1, displayLabel: 'Stale' })];
    const freshChapters = [makeChapter({ id: 2, displayLabel: 'Fresh' })];

    let resolveStale!: (v: ProjectChapter[]) => void;
    mockGetMilestoneChapters.mockImplementationOnce(
      () =>
        new Promise<ProjectChapter[]>(resolve => {
          resolveStale = resolve;
        }),
    );

    const { result } = renderHook(() => useMilestoneChapters(10, 100));

    let resolveFresh!: (v: ProjectChapter[]) => void;
    mockGetMilestoneChapters.mockImplementationOnce(
      () =>
        new Promise<ProjectChapter[]>(resolve => {
          resolveFresh = resolve;
        }),
    );
    const reloadPromise = result.current.reload();

    resolveFresh(freshChapters);
    await reloadPromise;
    await waitFor(() => expect(result.current.chapters).toEqual(freshChapters));

    resolveStale(staleChapters);
    await waitFor(() => {
      expect(result.current.chapters).toEqual(freshChapters);
    });
  });

  it('loads chapters for the active user on mount', async () => {
    const chapters = [makeChapter()];
    mockGetMilestoneChapters.mockResolvedValue(chapters);

    const { result } = renderHook(() => useMilestoneChapters(10, 100));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chapters).toEqual(chapters);
    expect(mockGetMilestoneChapters).toHaveBeenCalledWith(10, 1);
  });

  it('clears chapters and skips the query when there is no active user', async () => {
    mockParseUserId.mockReturnValue(null);

    const { result } = renderHook(() => useMilestoneChapters(10, 100));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chapters).toEqual([]);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();
  });

  it('does not expose cached chapters until membership resolves as revoked', async () => {
    mockGetActiveUserId.mockReturnValue('1');
    const cached = [makeChapter()];
    mockGetMilestoneChapters.mockResolvedValue(cached);
    const metadataRefresh = deferred<void>();
    const membership = deferred<boolean>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      metadataRefresh.promise,
    );
    mockIsUserProjectMember.mockReturnValueOnce(membership.promise);

    const { result } = renderHook(() => useMilestoneChapters(10, 100));

    expect(result.current.chapters).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();

    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });

    expect(result.current.chapters).toEqual([]);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();

    await act(async () => {
      membership.resolve(false);
      await membership.promise;
    });

    await waitFor(() => expect(result.current.removedFromProject).toBe(true));
    expect(result.current.chapters).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();
  });

  it('exposes chapters after the membership check confirms the user is still a member', async () => {
    mockGetActiveUserId.mockReturnValue('1');
    const cached = [makeChapter()];
    mockGetMilestoneChapters.mockResolvedValue(cached);
    const metadataRefresh = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      metadataRefresh.promise,
    );

    const { result } = renderHook(() => useMilestoneChapters(10, 100));

    expect(result.current.chapters).toEqual([]);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();

    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chapters).toEqual(cached);
    expect(result.current.removedFromProject).toBe(false);
    expect(mockIsUserProjectMember).toHaveBeenCalledWith(1, 100);
    expect(mockGetMilestoneChapters).toHaveBeenCalledTimes(1);
    expect(mockGetMilestoneChapters).toHaveBeenCalledWith(10, 1);
  });

  it('does not expose cached chapters when reload runs before membership resolves', async () => {
    mockGetActiveUserId.mockReturnValue('1');
    const cached = [makeChapter()];
    mockGetMilestoneChapters.mockResolvedValue(cached);
    const membership = deferred<boolean>();
    mockIsUserProjectMember.mockReturnValueOnce(membership.promise);

    const { result } = renderHook(() => useMilestoneChapters(10, 100));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.chapters).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();

    await act(async () => {
      membership.resolve(false);
      await membership.promise;
    });

    await waitFor(() => expect(result.current.removedFromProject).toBe(true));
    expect(result.current.chapters).toEqual([]);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();
  });

  it('skips the network membership refresh when offline and keeps the cached book', async () => {
    mockGetActiveUserId.mockReturnValue('1');
    const cached = [makeChapter()];
    mockGetMilestoneChapters.mockResolvedValue(cached);
    // Offline: refreshChapterMetadataIfOnline returns without hitting the
    // server, then the local membership row is still true.
    mockRefreshChapterMetadataIfOnline.mockResolvedValueOnce(undefined);
    mockIsUserProjectMember.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useMilestoneChapters(10, 100));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chapters).toEqual(cached);
    expect(result.current.removedFromProject).toBe(false);
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledWith(1);
    expect(mockIsUserProjectMember).toHaveBeenCalledWith(1, 100);
  });
});
