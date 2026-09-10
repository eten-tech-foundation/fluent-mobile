import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getProjectsWithSummary } from '../db/queries';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { parseUserId } from '../utils/parseUserId';
import { useProjectsSummary } from './useProjectsSummary';

let capturedFocusCallback: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    capturedFocusCallback = callback;
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../db/queries', () => ({
  getProjectsWithSummary: jest.fn(),
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

const mockGetProjectsWithSummary =
  getProjectsWithSummary as jest.MockedFunction<typeof getProjectsWithSummary>;
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

describe('useProjectsSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFocusCallback = null;
    mockParseUserId.mockReturnValue(7);
    mockGetActiveUserId.mockReturnValue('7');
    mockGetProjectsWithSummary.mockResolvedValue([]);
    mockRefreshChapterMetadataIfOnline.mockResolvedValue();
  });

  it('reloads from local cache on focus before metadata refresh completes', async () => {
    const firstMetadata = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      firstMetadata.promise,
    );

    renderHook(() => useProjectsSummary());

    await waitFor(() => {
      expect(mockGetProjectsWithSummary).toHaveBeenCalled();
    });

    await act(async () => {
      firstMetadata.resolve();
      await firstMetadata.promise;
    });

    await waitFor(() => {
      expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledTimes(1);
    });

    const callsAfterMount = mockGetProjectsWithSummary.mock.calls.length;

    const secondMetadata = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      secondMetadata.promise,
    );

    await act(async () => {
      capturedFocusCallback?.();
    });

    await waitFor(() => {
      expect(mockGetProjectsWithSummary.mock.calls.length).toBeGreaterThan(
        callsAfterMount,
      );
    });
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledTimes(2);
  });

  it('starts a trailing reload when a load is requested while another is in flight', async () => {
    const firstLoad =
      deferred<Awaited<ReturnType<typeof getProjectsWithSummary>>>();
    mockGetProjectsWithSummary.mockReturnValueOnce(firstLoad.promise);
    mockGetProjectsWithSummary.mockResolvedValue([]);

    const metadata = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValue(metadata.promise);

    const { result } = renderHook(() => useProjectsSummary());

    await waitFor(() => {
      expect(mockGetProjectsWithSummary).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      void result.current.refresh();
    });

    expect(mockGetProjectsWithSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstLoad.resolve([]);
      await firstLoad.promise;
    });

    await waitFor(() => {
      expect(mockGetProjectsWithSummary).toHaveBeenCalledTimes(2);
    });
  });
});
