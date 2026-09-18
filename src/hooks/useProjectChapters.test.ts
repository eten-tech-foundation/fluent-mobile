import { renderHook, waitFor } from '@testing-library/react-native';
import { useProjectChapters } from './useProjectChapters';
import { getMilestoneChapters } from '../db/queries';
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

describe('useProjectChapters', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockParseUserId.mockReturnValue(1);
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

    const { result } = renderHook(() => useProjectChapters(10, 100));

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

    const { result } = renderHook(() => useProjectChapters(10, 100));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chapters).toEqual(chapters);
    expect(mockGetMilestoneChapters).toHaveBeenCalledWith(10, 1);
  });

  it('clears chapters and skips the query when there is no active user', async () => {
    mockParseUserId.mockReturnValue(null);

    const { result } = renderHook(() => useProjectChapters(10, 100));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chapters).toEqual([]);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();
  });
});
