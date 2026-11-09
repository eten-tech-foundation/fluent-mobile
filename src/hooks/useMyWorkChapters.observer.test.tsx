import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getMyWorkChapters } from '../db/queries';
import { getActiveUserId } from '../services/storage';
import { getObserverProjectIds } from '../services/userOrgGrants';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { getTranslatorProjectIds } from '../utils/myWorkDraftDownload';
import { parseUserId } from '../utils/parseUserId';
import { useMyWorkChapters } from './useMyWorkChapters';
import type { MyWorkChapter } from '../types/db/types';

let capturedFocusCallback: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    capturedFocusCallback = callback;
    React.useEffect(() => callback(), [callback]);
  },
}));

let mockWrites = 0;
const mockConnection = {};
jest.mock('../db/queries', () => ({
  getMyWorkChapters: jest.fn(),
  getDatabaseWriteMark: jest.fn(async () => ({
    connection: mockConnection,
    changes: mockWrites,
  })),
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

jest.mock('../services/userOrgGrants', () => ({
  getObserverProjectIds: jest.fn(),
}));

jest.mock('../utils/myWorkDraftDownload', () => ({
  getTranslatorProjectIds: jest.fn(() => []),
}));

jest.mock('../services/sync', () => ({
  refreshChapterMetadataIfOnline: jest.fn(),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(),
}));

const mockGetMyWorkChapters = getMyWorkChapters as jest.MockedFunction<
  typeof getMyWorkChapters
>;
const mockGetActiveUserId = getActiveUserId as jest.MockedFunction<
  typeof getActiveUserId
>;
const mockGetObserverProjectIds = getObserverProjectIds as jest.MockedFunction<
  typeof getObserverProjectIds
>;
const mockGetTranslatorProjectIds =
  getTranslatorProjectIds as jest.MockedFunction<
    typeof getTranslatorProjectIds
  >;
const mockRefreshChapterMetadataIfOnline =
  refreshChapterMetadataIfOnline as jest.MockedFunction<
    typeof refreshChapterMetadataIfOnline
  >;
const mockParseUserId = parseUserId as jest.MockedFunction<typeof parseUserId>;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const observerChapter: MyWorkChapter = {
  id: 13,
  displayLabel: 'Luke 6',
  bookName: 'Luke',
  chapterNumber: 6,
  assignmentStatus: 'linguist_check',
  workflowStage: null,
  syncState: 'synced',
  ownershipState: 'unassigned',
  completedVerses: 1,
  totalVerses: 5,
  downloadedVerses: 5,
  hasConflict: false,
  projectName: 'Gospel of Luke',
  milestoneName: 'Phase 1',
  targetLanguageName: 'Baka',
  projectUnitId: 11,
  projectId: 100,
  bibleId: 5,
  bookId: 42,
  bookCode: 'LUK',
  assignedUserId: null,
  peerCheckerId: null,
  listAccess: 'observer',
};

const assignedChapter: MyWorkChapter = {
  id: 10,
  displayLabel: 'Luke 4',
  bookName: 'Luke',
  chapterNumber: 4,
  assignmentStatus: 'draft',
  workflowStage: 'draft',
  syncState: 'synced',
  ownershipState: 'mine',
  completedVerses: 1,
  totalVerses: 5,
  downloadedVerses: 5,
  hasConflict: false,
  projectName: 'Gospel of Luke',
  milestoneName: 'Phase 1',
  targetLanguageName: 'Baka',
  projectUnitId: 11,
  projectId: 3,
  bibleId: 5,
  bookId: 42,
  bookCode: 'LUK',
  assignedUserId: 7,
  peerCheckerId: null,
  listAccess: 'assigned',
};

const openPeerChapter: MyWorkChapter = {
  id: 15,
  displayLabel: 'Luke 8',
  bookName: 'Luke',
  chapterNumber: 8,
  assignmentStatus: 'peer_check',
  workflowStage: 'peer_check',
  syncState: 'synced',
  ownershipState: 'unassigned',
  completedVerses: 1,
  totalVerses: 5,
  downloadedVerses: 5,
  hasConflict: false,
  projectName: 'Gospel of Luke',
  milestoneName: 'Phase 1',
  targetLanguageName: 'Baka',
  projectUnitId: 11,
  projectId: 3,
  bibleId: 5,
  bookId: 42,
  bookCode: 'LUK',
  assignedUserId: 9,
  peerCheckerId: null,
  listAccess: 'open_peer',
};

describe('useMyWorkChapters Observer grants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFocusCallback = null;
    mockWrites = 0;
    mockParseUserId.mockReturnValue(7);
    mockGetActiveUserId.mockReturnValue('7');
    mockGetObserverProjectIds.mockReturnValue([100]);
    mockGetTranslatorProjectIds.mockReturnValue([]);
    mockGetMyWorkChapters.mockResolvedValue([observerChapter]);
    mockRefreshChapterMetadataIfOnline.mockResolvedValue();
  });

  it('passes getObserverProjectIds into the query for a valid active account', async () => {
    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledWith(7, {
        grantProjectIds: [100],
        translatorProjectIds: [],
      });
    });
    expect(mockGetObserverProjectIds).toHaveBeenCalledWith('7');
    await waitFor(() => {
      expect(result.current.chapters).toEqual([observerChapter]);
    });
  });

  it('asks for the write mark first, then reads without waiting for it', async () => {
    const queries = jest.requireMock('../db/queries') as {
      getDatabaseWriteMark: jest.Mock;
    };
    const mark = deferred<{ connection: object; changes: number }>();
    queries.getDatabaseWriteMark.mockReturnValueOnce(mark.promise);

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => expect(mockGetMyWorkChapters).toHaveBeenCalled());
    expect(
      queries.getDatabaseWriteMark.mock.invocationCallOrder[0],
    ).toBeLessThan(mockGetMyWorkChapters.mock.invocationCallOrder[0]);
    expect(result.current.chapters).toEqual([]);

    await act(async () =>
      mark.resolve({ connection: mockConnection, changes: 0 }),
    );
    await waitFor(() =>
      expect(result.current.chapters).toEqual([observerChapter]),
    );
  });

  it('shows saved rows while the mount metadata refresh is out, and does not re-read when it lands (#886)', async () => {
    const mountMetadata = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      mountMetadata.promise,
    );

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chapters).toEqual([observerChapter]);
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledWith(7);
    const shown = result.current.chapters;

    await act(async () => {
      mountMetadata.resolve();
      await mountMetadata.promise;
    });

    expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(1);
    expect(result.current.chapters).toBe(shown);
  });

  it('passes empty grant IDs when snapshot is unknown/revoked', async () => {
    mockGetObserverProjectIds.mockReturnValue([]);
    mockGetMyWorkChapters.mockResolvedValue([]);

    renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledWith(7, {
        grantProjectIds: [],
        translatorProjectIds: [],
      });
    });
  });

  it('drops stale query responses after an account switch', async () => {
    mockRefreshChapterMetadataIfOnline.mockReturnValue(new Promise(() => {}));
    const slow = deferred<MyWorkChapter[]>();
    mockGetMyWorkChapters.mockReturnValueOnce(slow.promise);

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(1);
    });

    mockParseUserId.mockReturnValue(8);
    mockGetActiveUserId.mockReturnValue('8');
    mockGetObserverProjectIds.mockReturnValue([]);
    mockGetMyWorkChapters.mockResolvedValue([]);

    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      slow.resolve([observerChapter]);
      await slow.promise;
    });

    await waitFor(() => {
      expect(result.current.chapters).toEqual([]);
    });
    expect(result.current.chapters).not.toContainEqual(observerChapter);
  });

  it('filters Observer rows when grant is revoked while the query is pending', async () => {
    // Hold metadata refresh so focus-effect cannot race a second query.
    mockRefreshChapterMetadataIfOnline.mockReturnValue(new Promise(() => {}));
    const slow = deferred<MyWorkChapter[]>();
    mockGetMyWorkChapters.mockReturnValueOnce(slow.promise);

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(1);
    });

    // Same account; grant revoked/unknown before publish.
    mockGetObserverProjectIds.mockReturnValue([]);

    await act(async () => {
      slow.resolve([observerChapter, assignedChapter]);
      await slow.promise;
    });

    await waitFor(() => {
      expect(result.current.chapters).toEqual([assignedChapter]);
    });
  });

  it('filters open Peer Check rows when Translator grant is revoked while pending', async () => {
    mockRefreshChapterMetadataIfOnline.mockReturnValue(new Promise(() => {}));
    mockGetTranslatorProjectIds.mockReturnValue([3]);
    const slow = deferred<MyWorkChapter[]>();
    mockGetMyWorkChapters.mockReturnValueOnce(slow.promise);

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledWith(7, {
        grantProjectIds: [100],
        translatorProjectIds: [3],
      });
    });

    mockGetTranslatorProjectIds.mockReturnValue([]);

    await act(async () => {
      slow.resolve([openPeerChapter, assignedChapter]);
      await slow.promise;
    });

    await waitFor(() => {
      expect(result.current.chapters).toEqual([assignedChapter]);
    });
  });

  it('clears previously published rows when a later load sees an invalid account', async () => {
    mockRefreshChapterMetadataIfOnline.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(result.current.chapters).toEqual([observerChapter]);
    });

    const late = deferred<MyWorkChapter[]>();
    mockGetMyWorkChapters.mockReturnValueOnce(late.promise);

    // Start a second load, then invalidate account so in-flight cannot publish.
    let refreshDone!: Promise<void>;
    await act(async () => {
      refreshDone = result.current.refresh();
    });
    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(2);
    });

    mockGetActiveUserId.mockReturnValue('8');
    mockParseUserId.mockReturnValue(7);

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.chapters).toEqual([]);

    await act(async () => {
      late.resolve([observerChapter]);
      await late.promise;
      await refreshDone;
    });

    expect(result.current.chapters).toEqual([]);
  });

  it('clears chapters when active and synced ids drift', async () => {
    mockGetActiveUserId.mockReturnValue('8');
    mockParseUserId.mockReturnValue(7);

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(mockGetMyWorkChapters).not.toHaveBeenCalled();
    expect(result.current.chapters).toEqual([]);
  });

  it('clears published rows on load error even after an account switch', async () => {
    mockRefreshChapterMetadataIfOnline.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(result.current.chapters).toEqual([observerChapter]);
    });

    const failing = deferred<MyWorkChapter[]>();
    mockGetMyWorkChapters.mockReturnValueOnce(failing.promise);

    let refreshDone!: Promise<void>;
    await act(async () => {
      refreshDone = result.current.refresh();
    });
    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(2);
    });

    // Account changed during the failed await — still fail closed.
    mockParseUserId.mockReturnValue(8);
    mockGetActiveUserId.mockReturnValue('8');
    mockGetObserverProjectIds.mockReturnValue([]);

    await act(async () => {
      failing.reject(new Error('query failed'));
      await refreshDone;
    });

    expect(result.current.chapters).toEqual([]);
  });

  describe('on regaining focus', () => {
    async function mounted() {
      const hook = renderHook(() => useMyWorkChapters());
      await waitFor(() =>
        expect(hook.result.current.chapters).toEqual([observerChapter]),
      );
      return hook;
    }

    async function refocus() {
      await act(async () => {
        capturedFocusCallback?.();
      });
    }

    it('skips the read when nothing was written, still refreshing metadata', async () => {
      const { result } = await mounted();
      const shown = result.current.chapters;

      await refocus();

      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(1);
      expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledTimes(2);
      expect(result.current.chapters).toBe(shown);
    });

    it('reads again after a write', async () => {
      const { result } = await mounted();
      mockGetMyWorkChapters.mockResolvedValueOnce([
        observerChapter,
        assignedChapter,
      ]);

      mockWrites = 1;
      await refocus();

      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(2);
      expect(result.current.chapters).toEqual([
        observerChapter,
        assignedChapter,
      ]);
    });

    it('drops Observer rows when the grant was revoked away from the screen', async () => {
      const { result } = await mounted();
      mockGetObserverProjectIds.mockReturnValue([]);
      mockGetMyWorkChapters.mockResolvedValueOnce([]);

      await refocus();

      expect(mockGetMyWorkChapters).toHaveBeenLastCalledWith(7, {
        grantProjectIds: [],
        translatorProjectIds: [],
      });
      expect(result.current.chapters).toEqual([]);
    });

    it('loads rows for a grant gained while the last query was pending', async () => {
      mockRefreshChapterMetadataIfOnline.mockReturnValue(new Promise(() => {}));
      const gainedChapter: MyWorkChapter = {
        ...observerChapter,
        id: 21,
        displayLabel: 'Acts 1',
        projectId: 200,
      };
      const slow = deferred<MyWorkChapter[]>();
      mockGetMyWorkChapters.mockReturnValueOnce(slow.promise);
      const { result } = renderHook(() => useMyWorkChapters());
      await waitFor(() =>
        expect(mockGetMyWorkChapters).toHaveBeenCalledWith(7, {
          grantProjectIds: [100],
          translatorProjectIds: [],
        }),
      );

      mockGetObserverProjectIds.mockReturnValue([100, 200]);
      await act(async () => {
        slow.resolve([observerChapter]);
        await slow.promise;
      });
      expect(result.current.chapters).toEqual([observerChapter]);

      mockGetMyWorkChapters.mockResolvedValueOnce([
        observerChapter,
        gainedChapter,
      ]);
      await refocus();

      expect(mockGetMyWorkChapters).toHaveBeenLastCalledWith(7, {
        grantProjectIds: [100, 200],
        translatorProjectIds: [],
      });
      expect(result.current.chapters).toEqual([observerChapter, gainedChapter]);
    });

    it('reads again when Translator grants change', async () => {
      await mounted();
      mockGetTranslatorProjectIds.mockReturnValue([3]);

      await refocus();

      expect(mockGetMyWorkChapters).toHaveBeenLastCalledWith(7, {
        grantProjectIds: [100],
        translatorProjectIds: [3],
      });
    });

    it("never keeps the previous account's rows after an account switch", async () => {
      const { result } = await mounted();
      mockParseUserId.mockReturnValue(8);
      mockGetActiveUserId.mockReturnValue('8');
      mockGetObserverProjectIds.mockReturnValue([]);
      mockGetMyWorkChapters.mockResolvedValueOnce([]);

      await refocus();

      expect(mockGetMyWorkChapters).toHaveBeenLastCalledWith(8, {
        grantProjectIds: [],
        translatorProjectIds: [],
      });
      expect(result.current.chapters).toEqual([]);
    });
  });

  describe('when the refresh key changes', () => {
    async function mountedWithKey() {
      const hook = renderHook(
        ({ key }: { key: number }) => useMyWorkChapters(key),
        { initialProps: { key: 0 } },
      );
      await waitFor(() =>
        expect(hook.result.current.chapters).toEqual([observerChapter]),
      );
      return hook;
    }

    it('skips the read when nothing was written since the list was read', async () => {
      const { result, rerender } = await mountedWithKey();
      const shown = result.current.chapters;

      rerender({ key: 1 });
      await act(async () => {});

      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(1);
      expect(result.current.chapters).toBe(shown);
    });

    it('reads again after a write', async () => {
      const { result, rerender } = await mountedWithKey();
      mockGetMyWorkChapters.mockResolvedValueOnce([
        observerChapter,
        assignedChapter,
      ]);

      mockWrites = 1;
      rerender({ key: 1 });

      await waitFor(() =>
        expect(result.current.chapters).toEqual([
          observerChapter,
          assignedChapter,
        ]),
      );
    });

    it('reads again when a write landed during the last read', async () => {
      mockGetMyWorkChapters.mockImplementationOnce(async () => {
        mockWrites = 1;
        return [observerChapter];
      });
      const { rerender } = await mountedWithKey();

      rerender({ key: 1 });

      await waitFor(() =>
        expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(2),
      );
    });

    it('reads again when grants changed without a write', async () => {
      const { result, rerender } = await mountedWithKey();
      mockGetObserverProjectIds.mockReturnValue([]);
      mockGetMyWorkChapters.mockResolvedValueOnce([]);

      rerender({ key: 1 });

      await waitFor(() => expect(result.current.chapters).toEqual([]));
      expect(mockGetMyWorkChapters).toHaveBeenLastCalledWith(7, {
        grantProjectIds: [],
        translatorProjectIds: [],
      });
    });

    it('reads again for another account', async () => {
      const { result, rerender } = await mountedWithKey();
      mockParseUserId.mockReturnValue(8);
      mockGetActiveUserId.mockReturnValue('8');
      mockGetObserverProjectIds.mockReturnValue([]);
      mockGetMyWorkChapters.mockResolvedValueOnce([]);

      rerender({ key: 1 });

      await waitFor(() => expect(result.current.chapters).toEqual([]));
      expect(mockGetMyWorkChapters).toHaveBeenLastCalledWith(8, {
        grantProjectIds: [],
        translatorProjectIds: [],
      });
    });

    it('leaves explicit refresh unconditional', async () => {
      const { result } = await mountedWithKey();

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(2);
    });
  });
});
