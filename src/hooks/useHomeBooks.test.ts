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

let mockWrites: number | null = 0;
const mockConnection = {};
jest.mock('../db/queries', () => ({
  getHomeBookSummaries: jest.fn(),
  getDatabaseWriteMark: jest.fn(async () =>
    mockWrites === null
      ? null
      : { connection: mockConnection, changes: mockWrites },
  ),
  sameDatabaseWrites: (
    a: { connection: object; changes: number } | null,
    b: { connection: object; changes: number } | null,
  ) =>
    a !== null &&
    b !== null &&
    a.connection === b.connection &&
    a.changes === b.changes,
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
  pendingUploads: 0,
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
    mockWrites = 0;
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

  it('asks for the write mark first, then reads without waiting for it', async () => {
    const queries = jest.requireMock('../db/queries') as {
      getDatabaseWriteMark: jest.Mock;
    };
    let releaseMark!: () => void;
    queries.getDatabaseWriteMark.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseMark = () =>
            resolve({ connection: mockConnection, changes: 0 });
        }),
    );

    const { result } = renderHook(() => useHomeBooks());

    await waitFor(() => expect(mockGetHomeBookSummaries).toHaveBeenCalled());
    expect(
      queries.getDatabaseWriteMark.mock.invocationCallOrder[0],
    ).toBeLessThan(mockGetHomeBookSummaries.mock.invocationCallOrder[0]);
    expect(result.current.loading).toBe(true);

    await act(async () => releaseMark());
    await waitFor(() => expect(result.current.books).toEqual([MARK]));

    // The mark it published is the one taken before the read.
    const reads = mockGetHomeBookSummaries.mock.calls.length;
    await act(async () => capturedFocusCallback?.());
    await act(async () => capturedFocusCallback?.());
    expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(reads);
  });

  it('is empty without a user', async () => {
    mockParseUserId.mockReturnValue(null);

    const { result } = renderHook(() => useHomeBooks());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.books).toEqual([]);
    expect(mockGetHomeBookSummaries).not.toHaveBeenCalled();
  });

  it('reads once on mount, leaving the metadata refresh to the refresh key', async () => {
    const mountMetadata = deferred();
    mockRefresh.mockReturnValueOnce(mountMetadata.promise);
    const { result } = renderHook(() => useHomeBooks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      mountMetadata.resolve();
      await mountMetadata.promise;
    });

    expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith(7);
  });

  describe('on regaining focus', () => {
    async function mounted() {
      const hook = renderHook(() => useHomeBooks());
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      return hook;
    }

    async function refocus() {
      await act(async () => {
        capturedFocusCallback?.();
      });
    }

    it('skips the read when nothing was written, still refreshing metadata', async () => {
      const { result } = await mounted();
      const shown = result.current.books;

      await refocus();
      await refocus();

      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(3);
      expect(result.current.books).toBe(shown);
    });

    it('reads again at once after a write', async () => {
      const { result } = await mounted();
      const recorded = { ...MARK, recordedChapters: 1 };
      mockGetHomeBookSummaries.mockResolvedValueOnce([recorded]);

      mockWrites = 3;
      await refocus();

      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2);
      expect(result.current.books).toEqual([recorded]);
    });

    it('reads again after a write made while the screen was away', async () => {
      await mounted();
      await refocus();
      mockWrites = 1;

      await refocus();

      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2);
    });

    it("reads the new account's books after an account change", async () => {
      await mounted();

      mockParseUserId.mockReturnValue(8);
      await refocus();

      expect(mockGetHomeBookSummaries).toHaveBeenLastCalledWith(8);
    });

    it('reads again for a write that landed while the last read ran', async () => {
      mockGetHomeBookSummaries.mockImplementationOnce(async () => {
        mockWrites = 1;
        return [MARK];
      });
      await mounted();

      await refocus();

      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2);
    });

    it('retries after the last read failed', async () => {
      const { rerender } = renderHook(
        ({ key }: { key: number }) => useHomeBooks(key),
        { initialProps: { key: 0 } },
      );
      await waitFor(() => expect(mockGetHomeBookSummaries).toHaveBeenCalled());
      mockGetHomeBookSummaries.mockRejectedValueOnce(
        new Error('disk I/O error'),
      );
      mockWrites = 1;
      rerender({ key: 1 });
      await waitFor(() =>
        expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2),
      );

      await refocus();

      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(3);
    });

    it('reads when the write count cannot be read', async () => {
      await mounted();

      mockWrites = null;
      await refocus();

      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2);
    });

    it('leaves explicit refresh unconditional', async () => {
      const { result } = await mounted();

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps the same books array when a reread finds nothing changed', async () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useHomeBooks(key),
      { initialProps: { key: 0 } },
    );
    await waitFor(() => expect(result.current.books).toEqual([MARK]));
    const shown = result.current.books;

    mockGetHomeBookSummaries.mockResolvedValueOnce([{ ...MARK }]);
    mockWrites = 1;
    rerender({ key: 1 });
    await waitFor(() =>
      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2),
    );

    expect(result.current.books).toBe(shown);
    expect(result.current.loading).toBe(false);
  });

  it('keeps the newer books when an older read finishes last', async () => {
    let resolveOld: (books: HomeBookSummary[]) => void = () => {};
    mockGetHomeBookSummaries.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOld = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useHomeBooks(key),
      { initialProps: { key: 0 } },
    );

    rerender({ key: 1 });
    await waitFor(() => expect(result.current.books).toEqual([MARK]));

    await act(async () => {
      resolveOld([]);
    });
    expect(result.current.books).toEqual([MARK]);
  });

  it('keeps the books already shown when a later read fails', async () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useHomeBooks(key),
      { initialProps: { key: 0 } },
    );
    await waitFor(() => expect(result.current.books).toEqual([MARK]));

    mockGetHomeBookSummaries.mockRejectedValueOnce(new Error('disk I/O error'));
    mockWrites = 1;
    rerender({ key: 1 });

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.books).toEqual([MARK]);

    // The next read that lands clears it.
    mockWrites = 2;
    rerender({ key: 2 });
    await waitFor(() => expect(result.current.error).toBe(false));
  });

  it('reports a failed first read, so Home can tell it from no books', async () => {
    mockGetHomeBookSummaries.mockRejectedValueOnce(new Error('disk I/O error'));
    const { result } = renderHook(() => useHomeBooks());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.books).toEqual([]);
  });

  describe('when the refresh key changes', () => {
    async function mountedWithKey() {
      const hook = renderHook(({ key }: { key: number }) => useHomeBooks(key), {
        initialProps: { key: 0 },
      });
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      return hook;
    }

    it('reads again when the database was written', async () => {
      const { rerender } = await mountedWithKey();

      mockWrites = 1;
      rerender({ key: 1 });

      await waitFor(() =>
        expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2),
      );
    });

    it('skips the read when nothing was written since the books were read', async () => {
      const { result, rerender } = await mountedWithKey();
      const shown = result.current.books;

      rerender({ key: 1 });
      await act(async () => {});

      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(1);
      expect(result.current.books).toBe(shown);
    });

    it('reads again when a write landed during the last read', async () => {
      mockGetHomeBookSummaries.mockImplementationOnce(async () => {
        mockWrites = 1;
        return [MARK];
      });
      const { rerender } = await mountedWithKey();

      rerender({ key: 1 });

      await waitFor(() =>
        expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2),
      );
    });

    it('reads again for another account', async () => {
      const { rerender } = await mountedWithKey();

      mockParseUserId.mockReturnValue(8);
      rerender({ key: 1 });

      await waitFor(() =>
        expect(mockGetHomeBookSummaries).toHaveBeenLastCalledWith(8),
      );
    });

    it('reads when the write count cannot be read', async () => {
      const { rerender } = await mountedWithKey();

      mockWrites = null;
      rerender({ key: 1 });

      await waitFor(() =>
        expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2),
      );
    });

    it('reads again while the first read is still out', async () => {
      const first = deferred();
      mockGetHomeBookSummaries.mockImplementationOnce(async () => {
        await first.promise;
        return [];
      });
      const { result, rerender } = renderHook(
        ({ key }: { key: number }) => useHomeBooks(key),
        { initialProps: { key: 0 } },
      );

      rerender({ key: 1 });

      await waitFor(() => expect(result.current.books).toEqual([MARK]));
      expect(mockGetHomeBookSummaries).toHaveBeenCalledTimes(2);
      await act(async () => first.resolve());
    });
  });
});
