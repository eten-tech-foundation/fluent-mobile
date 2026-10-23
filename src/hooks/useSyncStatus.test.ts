const mockGetSyncError = jest.fn();
const mockKv = new Map<string, string>();

jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: (key: string) => mockKv.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      mockKv.set(key, value);
    },
    removeItemSync: (key: string) => {
      mockKv.delete(key);
    },
  })),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: () => {},
}));

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

jest.mock('./useReauthRequired', () => ({
  useReauthRequired: jest.fn(),
}));

jest.mock('../services/storage', () => {
  const actual = jest.requireActual('../services/storage');
  return {
    ...actual,
    getSyncError: (key: string) => mockGetSyncError(key),
  };
});

import { renderHook, waitFor } from '@testing-library/react-native';
import {
  addKnownUserId,
  clearReauthRequired,
  KV_KEYS,
  setReauthRequired,
  setUserEmail,
  setUserSync,
} from '../services/storage';
import { useConnectivity } from './useConnectivity';
import { usePreferences } from './usePreferences';
import { usePendingUploads } from './usePendingUploads';
import { useLocalSyncHealth } from './useLocalSyncHealth';
import { useReauthRequired } from './useReauthRequired';
import { useSyncStatus } from './useSyncStatus';

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
const mockUseReauthRequired = useReauthRequired as jest.MockedFunction<
  typeof useReauthRequired
>;

function mockOnlineWifi() {
  mockUseConnectivity.mockReturnValue({
    isOnline: true,
    isLinkOnline: true,
    isWifi: true,
    isCellular: false,
    connectionType: 'wifi',
    hasResolved: true,
    hasTransferResolved: true,
    connectivityPending: false,
    transferConnectivityPending: false,
  });
  mockUsePreferences.mockReturnValue({
    uploadOverCellular: false,
    uiVersion: 'legacy',
    preferences: { uploadOverCellular: false, uiVersion: 'legacy' },
    setUploadOverCellular: jest.fn(),
    setUiVersion: jest.fn(),
    setPreferences: jest.fn(),
    reload: jest.fn(),
  });
}

describe('useSyncStatus cellular gate', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockKv.clear();
    mockGetSyncError.mockReturnValue(undefined);
    mockUseReauthRequired.mockReturnValue({
      reauthRequired: false,
      refreshReauthRequired: jest.fn(),
    });
    mockUsePendingUploads.mockReturnValue({
      pendingCount: 0,
      pendingChapterCount: 0,
      failedCount: 0,
      unuploadableCount: 0,
      hasPendingUploads: false,
      hasFailedUploads: false,
      hasUnuploadablePending: false,
      countsUnknown: false,
      failedErrorText: null,
      isUploading: false,
      uploadProgress: null,
    });
    mockUseLocalSyncHealth.mockReturnValue({
      needsDownloadSync: false,
      checking: false,
    });
  });

  it('treats cellular as offline for sync chrome when uploadOverCellular is off', async () => {
    mockUseConnectivity.mockReturnValue({
      isOnline: true,
      isLinkOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
      hasResolved: true,
      hasTransferResolved: true,
      connectivityPending: false,
      transferConnectivityPending: false,
    });
    mockUsePreferences.mockReturnValue({
      uploadOverCellular: false,
      uiVersion: 'legacy',
      preferences: { uploadOverCellular: false, uiVersion: 'legacy' },
      setUploadOverCellular: jest.fn(),
      setUiVersion: jest.fn(),
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

  it('treats ethernet as online for sync chrome without the cellular toggle', async () => {
    mockUseConnectivity.mockReturnValue({
      isOnline: true,
      isLinkOnline: true,
      isWifi: false,
      isCellular: false,
      connectionType: 'ethernet',
      hasResolved: true,
      hasTransferResolved: true,
      connectivityPending: false,
      transferConnectivityPending: false,
    });
    mockUsePreferences.mockReturnValue({
      uploadOverCellular: false,
      uiVersion: 'legacy',
      preferences: { uploadOverCellular: false, uiVersion: 'legacy' },
      setUploadOverCellular: jest.fn(),
      setUiVersion: jest.fn(),
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

  it('does not report all-synced when pending counts are unknown', async () => {
    mockUsePendingUploads.mockReturnValue({
      pendingCount: 0,
      pendingChapterCount: 0,
      failedCount: 0,
      unuploadableCount: 0,
      hasPendingUploads: false,
      hasFailedUploads: false,
      hasUnuploadablePending: false,
      countsUnknown: true,
      failedErrorText: null,
      isUploading: false,
      uploadProgress: null,
    });
    mockUseConnectivity.mockReturnValue({
      isOnline: true,
      isLinkOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
      hasResolved: true,
      hasTransferResolved: true,
      connectivityPending: false,
      transferConnectivityPending: false,
    });
    mockUsePreferences.mockReturnValue({
      uploadOverCellular: false,
      uiVersion: 'legacy',
      preferences: { uploadOverCellular: false, uiVersion: 'legacy' },
      setUploadOverCellular: jest.fn(),
      setUiVersion: jest.fn(),
      setPreferences: jest.fn(),
      reload: jest.fn(),
    });

    const { result } = renderHook(() =>
      useSyncStatus({ isSyncing: false, refreshKey: 0 }),
    );

    await waitFor(() => {
      expect(result.current.status).not.toBe('online_synced');
      expect(result.current.status).not.toBe('offline_synced');
    });
  });

  it('allows cellular when uploadOverCellular is on', async () => {
    mockUseConnectivity.mockReturnValue({
      isOnline: true,
      isLinkOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
      hasResolved: true,
      hasTransferResolved: true,
      connectivityPending: false,
      transferConnectivityPending: false,
    });
    mockUsePreferences.mockReturnValue({
      uploadOverCellular: true,
      uiVersion: 'legacy',
      preferences: { uploadOverCellular: true, uiVersion: 'legacy' },
      setUploadOverCellular: jest.fn(),
      setUiVersion: jest.fn(),
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

describe('useSyncStatus metadata / reauth retry work', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockKv.clear();
    mockGetSyncError.mockReturnValue(undefined);
    mockUseReauthRequired.mockReturnValue({
      reauthRequired: false,
      refreshReauthRequired: jest.fn(),
    });
    mockUsePendingUploads.mockReturnValue({
      pendingCount: 0,
      pendingChapterCount: 0,
      failedCount: 0,
      unuploadableCount: 0,
      hasPendingUploads: false,
      hasFailedUploads: false,
      hasUnuploadablePending: false,
      countsUnknown: false,
      failedErrorText: null,
      isUploading: false,
      uploadProgress: null,
    });
    mockUseLocalSyncHealth.mockReturnValue({
      needsDownloadSync: false,
      checking: false,
    });
    mockOnlineWifi();
  });

  it('is online_needs_sync when active-user reauth is required (empty media queues)', async () => {
    mockUseReauthRequired.mockReturnValue({
      reauthRequired: true,
      refreshReauthRequired: jest.fn(),
    });

    const { result } = renderHook(() =>
      useSyncStatus({ isSyncing: false, refreshKey: 0 }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe('online_needs_sync');
      expect(result.current.status).not.toBe('online_synced');
      expect(result.current.hasSyncRetryWork).toBe(true);
      // Auto-repair must stay assignee-repair-only.
      expect(result.current.needsDownloadSync).toBe(false);
    });
  });

  it('is online_needs_sync when SYNC_ERROR_BIBLE_TEXTS is persisted', async () => {
    mockGetSyncError.mockImplementation((key: string) =>
      key === KV_KEYS.SYNC_ERROR_BIBLE_TEXTS ? 'Not Found' : undefined,
    );

    const { result } = renderHook(() =>
      useSyncStatus({ isSyncing: false, refreshKey: 0 }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe('online_needs_sync');
      expect(result.current.hasSyncRetryWork).toBe(true);
      expect(result.current.needsDownloadSync).toBe(false);
    });
  });

  it('is online_needs_sync when SYNC_ERROR_USER is persisted (401 / auth failure)', async () => {
    mockGetSyncError.mockImplementation((key: string) =>
      key === KV_KEYS.SYNC_ERROR_USER ? 'Unauthorized' : undefined,
    );

    const { result } = renderHook(() =>
      useSyncStatus({ isSyncing: false, refreshKey: 0 }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe('online_needs_sync');
      expect(result.current.hasSyncRetryWork).toBe(true);
    });
  });

  it('is online_synced when no metadata errors and no active-user reauth', async () => {
    const { result } = renderHook(() =>
      useSyncStatus({ isSyncing: false, refreshKey: 0 }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe('online_synced');
      expect(result.current.hasSyncRetryWork).toBe(false);
    });
  });

  it('does not treat inactive-user reauth as Home retry work (active-account isolation)', async () => {
    // Drive the real hook so isolation goes through isReauthRequiredForActiveUser
    // (inactive flag set, active user clear) — not a stubbed false return.
    const { useReauthRequired: realUseReauthRequired } = jest.requireActual<
      typeof import('./useReauthRequired')
    >('./useReauthRequired');
    mockUseReauthRequired.mockImplementation(realUseReauthRequired);

    setUserSync('1', 'one@example.com');
    addKnownUserId('2');
    setUserEmail('2', 'two@example.com');
    setReauthRequired('2');

    try {
      const { result } = renderHook(() =>
        useSyncStatus({ isSyncing: false, refreshKey: 0 }),
      );

      await waitFor(() => {
        expect(result.current.status).toBe('online_synced');
        expect(result.current.hasSyncRetryWork).toBe(false);
      });
    } finally {
      clearReauthRequired('2');
    }
  });
});
