import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getMilestonesWithSummary } from '../db/queries';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { parseUserId } from '../utils/parseUserId';
import { useMilestonesSummary } from './useMilestonesSummary';

let capturedFocusCallback: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    capturedFocusCallback = callback;
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../db/queries', () => ({
  getMilestonesWithSummary: jest.fn(),
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

const mockGetMilestonesWithSummary =
  getMilestonesWithSummary as jest.MockedFunction<
    typeof getMilestonesWithSummary
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

describe('useMilestonesSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFocusCallback = null;
    mockParseUserId.mockReturnValue(7);
    mockGetActiveUserId.mockReturnValue('7');
    mockGetMilestonesWithSummary.mockResolvedValue([]);
    mockRefreshChapterMetadataIfOnline.mockResolvedValue();
  });

  it('reloads from local cache on focus before metadata refresh completes', async () => {
    const firstMetadata = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      firstMetadata.promise,
    );

    renderHook(() => useMilestonesSummary());

    await waitFor(() => {
      expect(mockGetMilestonesWithSummary).toHaveBeenCalled();
    });

    await act(async () => {
      firstMetadata.resolve();
      await firstMetadata.promise;
    });

    await waitFor(() => {
      expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledTimes(1);
    });

    const callsAfterMount = mockGetMilestonesWithSummary.mock.calls.length;

    const secondMetadata = deferred<void>();
    mockRefreshChapterMetadataIfOnline.mockReturnValueOnce(
      secondMetadata.promise,
    );

    await act(async () => {
      capturedFocusCallback?.();
    });

    await waitFor(() => {
      expect(mockGetMilestonesWithSummary.mock.calls.length).toBeGreaterThan(
        callsAfterMount,
      );
    });
    expect(mockRefreshChapterMetadataIfOnline).toHaveBeenCalledTimes(2);
  });
});
