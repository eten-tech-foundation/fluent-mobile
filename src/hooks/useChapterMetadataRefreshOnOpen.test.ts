import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getMyWorkChapters, getMilestoneChapters } from '../db/queries';
import { isUserProjectMember } from '../db/repository';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { parseUserId } from '../utils/parseUserId';
import { useMyWorkChapters } from './useMyWorkChapters';
import { useMilestoneChapters } from './useMilestoneChapters';

let capturedFocusCallback: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    capturedFocusCallback = callback;
    React.useEffect(() => callback(), [callback]);
  },
}));

// No readable write count, so every focus rereads as before.
jest.mock('../db/queries', () => ({
  getMyWorkChapters: jest.fn(),
  getMilestoneChapters: jest.fn(),
  getDatabaseWriteMark: jest.fn(async () => null),
  sameDatabaseWrites: () => false,
}));

jest.mock('../db/repository', () => ({
  isUserProjectMember: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn(),
  getKnownUserIds: jest.fn(() => ['7']),
  isReauthRequired: jest.fn(() => false),
}));

jest.mock('../services/userOrgGrants', () => ({
  getObserverProjectIds: jest.fn(() => []),
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
const mockGetMilestoneChapters = getMilestoneChapters as jest.MockedFunction<
  typeof getMilestoneChapters
>;
const mockIsUserProjectMember = isUserProjectMember as jest.MockedFunction<
  typeof isUserProjectMember
>;
const mockGetActiveUserId = getActiveUserId as jest.MockedFunction<
  typeof getActiveUserId
>;
const mockRefreshChapterMetadataIfOnline =
  refreshChapterMetadataIfOnline as jest.MockedFunction<
    typeof refreshChapterMetadataIfOnline
  >;
const mockParseUserId = parseUserId as jest.MockedFunction<typeof parseUserId>;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('chapter metadata refresh on list open', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFocusCallback = null;
    mockParseUserId.mockReturnValue(7);
    mockGetActiveUserId.mockReturnValue('7');
    mockGetMyWorkChapters.mockResolvedValue([]);
    mockGetMilestoneChapters.mockResolvedValue([]);
    mockRefreshChapterMetadataIfOnline.mockResolvedValue();
    mockIsUserProjectMember.mockResolvedValue(true);
  });

  it('loads My Work from cache once, leaving the metadata refresh to the refresh key', async () => {
    const metadataRefresh = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      metadataRefresh.promise,
    );

    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useMyWorkChapters(key),
      { initialProps: { key: 0 } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledWith(7);
    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });
    expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(1);

    rerender({ key: 1 });
    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(2);
    });
    expect(result.current.loading).toBe(false);
  });

  it('re-reads My Work at once when the list regains focus', async () => {
    const { result } = renderHook(() => useMyWorkChapters());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      capturedFocusCallback?.();
    });

    expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(2);
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledTimes(2);
  });

  it('waits for membership before loading View Project chapters when still a member', async () => {
    const metadataRefresh = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      metadataRefresh.promise,
    );

    const { result } = renderHook(() => useMilestoneChapters(10, 3));

    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();
    expect(result.current.chapters).toEqual([]);
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledWith(7);

    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });

    await waitFor(() => {
      expect(mockIsUserProjectMember).toHaveBeenCalledWith(7, 3);
      expect(mockGetMilestoneChapters).toHaveBeenCalledTimes(1);
    });
    expect(mockGetMilestoneChapters).toHaveBeenCalledWith(10, 7);
  });

  it('flags removedFromProject and does not reload chapters when membership was revoked', async () => {
    const metadataRefresh = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      metadataRefresh.promise,
    );
    mockIsUserProjectMember.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useMilestoneChapters(10, 3));

    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();

    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });

    await waitFor(() => {
      expect(result.current.removedFromProject).toBe(true);
    });

    expect(result.current.chapters).toEqual([]);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();
  });

  it('clears removedFromProject when membership is restored on a later refresh', async () => {
    mockIsUserProjectMember.mockResolvedValueOnce(false);
    const first = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(first.promise);

    const { result } = renderHook(() => useMilestoneChapters(10, 3));

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    await waitFor(() => expect(result.current.removedFromProject).toBe(true));

    mockIsUserProjectMember.mockResolvedValueOnce(true);
    const second = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(second.promise);

    // Simulate a real second focus event (e.g. navigating back into the
    // screen) rather than relying on a prop change to retrigger the effect.
    await act(async () => {
      capturedFocusCallback?.();
    });

    await act(async () => {
      second.resolve();
      await second.promise;
    });

    await waitFor(() => expect(result.current.removedFromProject).toBe(false));
  });

  it('ignores a stale unassigned result after a newer open has started', async () => {
    const firstRefresh = deferred<void>();
    const firstMembership = deferred<boolean>();
    const secondRefresh = deferred<void>();
    const secondMembership = deferred<boolean>();
    mockRefreshChapterMetadataIfOnline
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise);
    mockIsUserProjectMember
      .mockReturnValueOnce(firstMembership.promise)
      .mockReturnValueOnce(secondMembership.promise);

    const { result } = renderHook(() => useMilestoneChapters(10, 3));

    await act(async () => {
      firstRefresh.resolve();
      await firstRefresh.promise;
    });
    await waitFor(() =>
      expect(mockIsUserProjectMember).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      capturedFocusCallback?.();
    });

    await act(async () => {
      secondRefresh.resolve();
      await secondRefresh.promise;
    });
    await waitFor(() =>
      expect(mockIsUserProjectMember).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      firstMembership.resolve(false);
      await firstMembership.promise;
    });

    expect(result.current.removedFromProject).toBe(false);
    expect(result.current.chapters).toEqual([]);
    expect(mockGetMilestoneChapters).not.toHaveBeenCalled();

    await act(async () => {
      secondMembership.resolve(true);
      await secondMembership.promise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.removedFromProject).toBe(false);
    expect(mockGetMilestoneChapters).toHaveBeenCalledTimes(1);
  });
});
