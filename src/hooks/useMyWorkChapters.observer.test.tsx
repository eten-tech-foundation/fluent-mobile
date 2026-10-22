import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getMyWorkChapters } from '../db/queries';
import { getActiveUserId } from '../services/storage';
import { getObserverProjectIds } from '../services/userOrgGrants';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { getTranslatorProjectIds } from '../utils/myWorkDraftDownload';
import { parseUserId } from '../utils/parseUserId';
import { useMyWorkChapters } from './useMyWorkChapters';
import type { MyWorkChapter } from '../types/db/types';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../db/queries', () => ({
  getMyWorkChapters: jest.fn(),
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
      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(1);
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
});
