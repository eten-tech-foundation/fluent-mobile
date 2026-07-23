import { renderHook, waitFor } from '@testing-library/react-native';
import { useSyncStatus } from './useSyncStatus';

jest.mock('./useConnectivity', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('./usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('./usePendingUploads', () => ({
  usePendingUploads: jest.fn(),
}));

jest.mock('./useLocalSyncHealth', () => ({
  useLocalSyncHealth: jest.fn(),
}));

import { useConnectivity } from './useConnectivity';
import { usePreferences } from './usePreferences';
import { usePendingUploads } from './usePendingUploads';
import { useLocalSyncHealth } from './useLocalSyncHealth';

const mockUseConnectivity = useConnectivity as jest.MockedFunction<
  typeof useConnectivity
>;
const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;
const mockUsePendingUploads = usePendingUploads as jest.MockedFunction<
  typeof usePendingUploads
>;
const mockUseLocalSyncHealth = useLocalSyncHealth as jest.MockedFunction<
  typeof useLocalSyncHealth
>;

describe('useSyncStatus cellular gate', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUsePendingUploads.mockReturnValue({
      pendingCount: 0,
      failedCount: 0,
      hasPendingUploads: false,
      hasFailedUploads: false,
      isUploading: false,
      uploadProgress: null,
    });
    mockUseLocalSyncHealth.mockReturnValue({
      needsDownloadSync: false,
      checking: false,
    });
  });

  it('treats cellular as offline for sync chrome when uploadOverCellular is off', async () => {
    mockUseConnectivity.mockReturnValue({ isOnline: true, isWifi: false });
    mockUsePreferences.mockReturnValue({
      uploadOverCellular: false,
      preferences: { uploadOverCellular: false },
      setUploadOverCellular: jest.fn(),
      setPreferences: jest.fn(),
      reload: jest.fn(),
    });

    const { result } = renderHook(() =>
      useSyncStatus({ isSyncing: false, refreshKey: 0 }),
    );

    await waitFor(() => {
      expect(result.current.isOnline).toBe(false);
      expect(result.current.status).toBe('offline_synced');
    });
  });

  it('allows cellular when uploadOverCellular is on', async () => {
    mockUseConnectivity.mockReturnValue({ isOnline: true, isWifi: false });
    mockUsePreferences.mockReturnValue({
      uploadOverCellular: true,
      preferences: { uploadOverCellular: true },
      setUploadOverCellular: jest.fn(),
      setPreferences: jest.fn(),
      reload: jest.fn(),
    });

    const { result } = renderHook(() =>
      useSyncStatus({ isSyncing: false, refreshKey: 0 }),
    );

    await waitFor(() => {
      expect(result.current.isOnline).toBe(true);
      expect(result.current.status).toBe('online_synced');
    });
  });
});
