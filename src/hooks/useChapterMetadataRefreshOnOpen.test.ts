import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getMyWorkChapters, getMilestoneChapters } from '../db/queries';
import { isUserProjectMember } from '../db/repository';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { parseUserId } from '../utils/parseUserId';
import { useMyWorkChapters } from './useMyWorkChapters';
import { useProjectChapters } from './useProjectChapters';

let capturedFocusCallback: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    capturedFocusCallback = callback;
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../db/queries', () => ({
  getMyWorkChapters: jest.fn(),
  getMilestoneChapters: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  isUserProjectMember: jest.fn(),
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

  it('loads My Work from cache immediately and refreshes it after metadata sync', async () => {
    const metadataRefresh = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      metadataRefresh.promise,
    );

    renderHook(() => useMyWorkChapters());

    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(1);
    });
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledWith(7);

    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });

    await waitFor(() => {
      expect(mockGetMyWorkChapters).toHaveBeenCalledTimes(2);
    });
  });

  it('loads View Project from cache immediately and refreshes it after metadata sync when still a member', async () => {
    const metadataRefresh = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      metadataRefresh.promise,
    );

    renderHook(() => useProjectChapters(10, 3));

    await waitFor(() => {
      expect(mockGetMilestoneChapters).toHaveBeenCalledTimes(1);
    });
    expect(mockGetMilestoneChapters).toHaveBeenCalledWith(10, 7);
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledWith(7);

    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });

    await waitFor(() => {
      expect(mockIsUserProjectMember).toHaveBeenCalledWith(7, 3);
      expect(mockGetMilestoneChapters).toHaveBeenCalledTimes(2);
    });
  });

  it('flags removedFromProject and does not reload chapters when membership was revoked', async () => {
    const metadataRefresh = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      metadataRefresh.promise,
    );
    mockIsUserProjectMember.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useProjectChapters(10, 3));

    await waitFor(() => {
      expect(mockGetMilestoneChapters).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });

    await waitFor(() => {
      expect(result.current.removedFromProject).toBe(true);
    });

    // second reload should never fire — membership was revoked
    expect(mockGetMilestoneChapters).toHaveBeenCalledTimes(1);
  });

  it('clears removedFromProject when membership is restored on a later refresh', async () => {
    mockIsUserProjectMember.mockResolvedValueOnce(false);
    const first = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(first.promise);

    const { result } = renderHook(() => useProjectChapters(10, 3));

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
});
