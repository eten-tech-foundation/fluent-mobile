import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getMyWorkChapters, getProjectChapters } from '../db/queries';
import { isUserProjectMember } from '../db/repository';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { parseUserId } from '../utils/parseUserId';
import { useMyWorkChapters } from './useMyWorkChapters';
import { useProjectChapters } from './useProjectChapters';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../db/queries', () => ({
  getMyWorkChapters: jest.fn(),
  getProjectChapters: jest.fn(),
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
const mockGetProjectChapters = getProjectChapters as jest.MockedFunction<
  typeof getProjectChapters
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
    mockParseUserId.mockReturnValue(7);
    mockGetActiveUserId.mockReturnValue('7');
    mockGetMyWorkChapters.mockResolvedValue([]);
    mockGetProjectChapters.mockResolvedValue([]);
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

    renderHook(() => useProjectChapters(3));

    await waitFor(() => {
      expect(mockGetProjectChapters).toHaveBeenCalledTimes(1);
    });
    expect(mockGetProjectChapters).toHaveBeenCalledWith(3, 7);
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledWith(7);

    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });

    await waitFor(() => {
      expect(mockIsUserProjectMember).toHaveBeenCalledWith(7, 3);
      expect(mockGetProjectChapters).toHaveBeenCalledTimes(2);
    });
  });

  it('flags removedFromProject and does not reload chapters when membership was revoked', async () => {
    const metadataRefresh = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      metadataRefresh.promise,
    );
    mockIsUserProjectMember.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useProjectChapters(3));

    await waitFor(() => {
      expect(mockGetProjectChapters).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      metadataRefresh.resolve();
      await metadataRefresh.promise;
    });

    await waitFor(() => {
      expect(result.current.removedFromProject).toBe(true);
    });

    // second reload should never fire — membership was revoked
    expect(mockGetProjectChapters).toHaveBeenCalledTimes(1);
  });
});
