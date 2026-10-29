import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getHomeBookSummaries } from '../db/queries';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import type { HomeBookSummary } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { useHomeBooks } from './useHomeBooks';

let capturedFocusCallback: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    capturedFocusCallback = callback;
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../db/queries', () => ({
  getHomeBookSummaries: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn(),
}));

jest.mock('../services/sync', () => ({
  refreshChapterMetadataIfOnline: jest.fn(),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

const mockGetHomeBookSummaries = getHomeBookSummaries as jest.MockedFunction<
  typeof getHomeBookSummaries
>;
const mockGetActiveUserId = getActiveUserId as jest.MockedFunction<
  typeof getActiveUserId
>;
const mockRefresh = refreshChapterMetadataIfOnline as jest.MockedFunction<
  typeof refreshChapterMetadataIfOnline
>;
const mockParseUserId = parseUserId as jest.MockedFunction<typeof parseUserId>;

const MARK: HomeBookSummary = {
  key: '10:41',
  bookId: 41,
  bookName: 'Mark',
  projectId: 1,
  projectUnitId: 10,
  projectName: 'Baka NT',
  milestoneName: 'Gospels',
  targetLanguageName: 'Baka',
  firstChapterId: 5,
  mine: 1,
  withOthers: 0,
  open: 2,
  complete: 0,
  totalChapters: 3,
  recordedChapters: 0,
  checkedChapters: 0,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useHomeBooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFocusCallback = null;
    mockParseUserId.mockReturnValue(7);
    mockGetActiveUserId.mockReturnValue('7');
    mockGetHomeBookSummaries.mockResolvedValue([MARK]);
    mockRefresh.mockResolvedValue();
  });

  it('loads the books for the signed-in user', async () => {
    const { result } = renderHook(() => useHomeBooks());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.books).toEqual([MARK]);
    expect(mockGetHomeBookSummaries).toHaveBeenCalledWith(7);
  });

  it('is empty without a user', async () => {
    mockParseUserId.mockReturnValue(null);

    const { result } = renderHook(() => useHomeBooks());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.books).toEqual([]);
    expect(mockGetHomeBookSummaries).not.toHaveBeenCalled();
  });

  it('reads once on mount, and on focus once the metadata refresh lands', async () => {
    const mountMetadata = deferred();
    mockRefresh.mockReturnValueOnce(mountMetadata.promise);
    const { result } = renderHook(() => useHomeBooks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(1);
    await act(async () => {
      mountMetadata.resolve();
      await mountMetadata.promise;
    });
    await waitFor(() =>
      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2),
    );

    const metadata = deferred();
    mockRefresh.mockReturnValueOnce(metadata.promise);
    await act(async () => {
      capturedFocusCallback?.();
    });
    expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2);

    await act(async () => {
      metadata.resolve();
      await metadata.promise;
    });
    await waitFor(() =>
      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(3),
    );
  });

  it('reloads when the refresh key changes', async () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useHomeBooks(key),
      { initialProps: { key: 0 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = mockGetHomeBookSummaries.mock.calls.length;

    rerender({ key: 1 });

    await waitFor(() =>
      expect(mockGetHomeBookSummaries.mock.calls.length).toBeGreaterThan(
        before,
      ),
    );
  });
});
