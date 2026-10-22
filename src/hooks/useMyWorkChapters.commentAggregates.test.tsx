import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getMyWorkChapters } from '../db/queries';
import { getCredentials } from '../services/keychain';
import {
  getCommentAggregateCacheEntry,
  refreshMyWorkCommentAggregates,
} from '../services/myWorkCommentAggregates';
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

jest.mock('../services/keychain', () => ({
  getCredentials: jest.fn(),
}));

jest.mock('../services/myWorkCommentAggregates', () => ({
  getCommentAggregateCacheEntry: jest.fn(),
  refreshMyWorkCommentAggregates: jest.fn(),
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

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

const mockGetMyWorkChapters = getMyWorkChapters as jest.MockedFunction<
  typeof getMyWorkChapters
>;
const mockGetActiveUserId = getActiveUserId as jest.MockedFunction<
  typeof getActiveUserId
>;
const mockGetCredentials = getCredentials as jest.MockedFunction<
  typeof getCredentials
>;
const mockGetCommentAggregateCacheEntry =
  getCommentAggregateCacheEntry as jest.MockedFunction<
    typeof getCommentAggregateCacheEntry
  >;
const mockRefreshMyWorkCommentAggregates =
  refreshMyWorkCommentAggregates as jest.MockedFunction<
    typeof refreshMyWorkCommentAggregates
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

const assignedChapter: MyWorkChapter = {
  id: 9,
  displayLabel: 'Mark 1',
  bookName: 'Mark',
  chapterNumber: 1,
  assignmentStatus: 'draft',
  workflowStage: 'draft',
  syncState: 'synced',
  ownershipState: 'mine',
  completedVerses: 1,
  totalVerses: 5,
  downloadedVerses: 5,
  hasConflict: false,
  stageEnteredAt: null,
  projectName: 'Demo',
  targetLanguageName: 'English',
  projectUnitId: 11,
  projectId: 3,
  bibleId: 5,
  bookId: 41,
  bookCode: 'MRK',
  assignedUserId: 7,
  peerCheckerId: null,
  listAccess: 'assigned',
};

const observerChapter: MyWorkChapter = {
  ...assignedChapter,
  id: 13,
  displayLabel: 'Luke 6',
  listAccess: 'observer',
  projectId: 100,
  assignedUserId: null,
};

describe('useMyWorkChapters comment aggregates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseUserId.mockReturnValue(7);
    mockGetActiveUserId.mockReturnValue('7');
    mockGetObserverProjectIds.mockReturnValue([100]);
    mockGetTranslatorProjectIds.mockReturnValue([]);
    mockGetMyWorkChapters.mockResolvedValue([assignedChapter]);
    mockRefreshChapterMetadataIfOnline.mockReturnValue(new Promise(() => {}));
    mockGetCommentAggregateCacheEntry.mockReturnValue({ status: 'unknown' });
    mockGetCredentials.mockResolvedValue({ token: 'tok-7' });
    mockRefreshMyWorkCommentAggregates.mockResolvedValue();
  });

  it('publishes cached rows promptly then refreshes aggregates in background', async () => {
    mockGetCommentAggregateCacheEntry.mockReturnValue({
      status: 'known',
      commentCount: 0,
      currentUserHasCommented: false,
    });
    const slowRefresh = deferred<void>();
    mockRefreshMyWorkCommentAggregates.mockReturnValue(slowRefresh.promise);

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(result.current.chapters).toEqual([
        {
          ...assignedChapter,
          commentAggregate: {
            status: 'known',
            commentCount: 0,
            currentUserHasCommented: false,
            originatingUserId: '7',
          },
        },
      ]);
    });

    expect(mockRefreshMyWorkCommentAggregates).toHaveBeenCalledWith({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: [9],
    });

    mockGetCommentAggregateCacheEntry.mockReturnValue({
      status: 'known',
      commentCount: 4,
      currentUserHasCommented: true,
    });

    await act(async () => {
      slowRefresh.resolve();
      await slowRefresh.promise;
    });

    await waitFor(() => {
      expect(result.current.chapters[0]?.commentAggregate).toEqual({
        status: 'known',
        commentCount: 4,
        currentUserHasCommented: true,
        originatingUserId: '7',
      });
    });
  });

  it('drops late aggregate publish after account switch', async () => {
    const slowRefresh = deferred<void>();
    mockRefreshMyWorkCommentAggregates.mockReturnValue(slowRefresh.promise);

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(result.current.chapters).toEqual([assignedChapter]);
    });

    mockParseUserId.mockReturnValue(8);
    mockGetActiveUserId.mockReturnValue('8');

    await act(async () => {
      slowRefresh.resolve();
      await slowRefresh.promise;
    });

    expect(result.current.chapters).toEqual([assignedChapter]);
    expect(mockGetCommentAggregateCacheEntry).not.toHaveBeenCalledWith(
      '8',
      expect.anything(),
    );
  });

  it('re-filters Observer rows before late aggregate republish', async () => {
    mockGetMyWorkChapters.mockResolvedValue([assignedChapter, observerChapter]);
    const slowRefresh = deferred<void>();
    mockRefreshMyWorkCommentAggregates.mockReturnValue(slowRefresh.promise);

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(result.current.chapters.map(c => c.id)).toEqual([9, 13]);
    });

    mockGetObserverProjectIds.mockReturnValue([]);
    mockGetCommentAggregateCacheEntry.mockReturnValue({
      status: 'known',
      commentCount: 2,
      currentUserHasCommented: false,
    });

    await act(async () => {
      slowRefresh.resolve();
      await slowRefresh.promise;
    });

    await waitFor(() => {
      expect(result.current.chapters.map(c => c.id)).toEqual([9]);
    });
  });

  it('resolves cached SQLite rows while getCredentials is still pending', async () => {
    const slowCreds = deferred<{ token: string } | null>();
    mockGetCredentials.mockReturnValue(slowCreds.promise);

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.chapters).toEqual([assignedChapter]);
    expect(result.current.chapters[0]?.commentAggregate).toBeUndefined();
    expect(mockRefreshMyWorkCommentAggregates).not.toHaveBeenCalled();

    await act(async () => {
      slowCreds.resolve({ token: 'tok-7' });
      await slowCreds.promise;
    });

    await waitFor(() => {
      expect(mockRefreshMyWorkCommentAggregates).toHaveBeenCalledTimes(1);
    });
    expect(result.current.chapters).toEqual([assignedChapter]);
  });

  it('keeps chapter rows when getCredentials rejects', async () => {
    mockGetCredentials.mockRejectedValue(new Error('keychain unavailable'));

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.chapters).toEqual([assignedChapter]);
    expect(result.current.chapters[0]?.commentAggregate).toBeUndefined();
    expect(mockRefreshMyWorkCommentAggregates).not.toHaveBeenCalled();
  });

  it('keeps chapter rows when aggregate refresh rejects', async () => {
    mockRefreshMyWorkCommentAggregates.mockRejectedValue(
      new Error('aggregate wave failed'),
    );

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.chapters).toEqual([assignedChapter]);
    expect(result.current.chapters[0]?.commentAggregate).toBeUndefined();
  });
});
