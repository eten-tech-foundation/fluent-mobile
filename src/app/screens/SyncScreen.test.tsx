import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import SyncScreen from './SyncScreen';

const mockGoBack = jest.fn();
const mockPush = jest.fn();
const mockTriggerSync = jest.fn();
const mockPauseUploadSession = jest.fn();
const mockCancelUploadSession = jest.fn();
const mockSyncNowUploads = jest.fn();

let mockPageStatus = 'pending';
let mockCellularBlocked = false;
let mockIsOnline = true;
let mockIsSyncing = false;
let mockDisplayText = 'Last synced: Just now';
let mockStateType: 'normal' | 'syncing' | 'never' | 'error' = 'normal';
let mockHasFailedUploads = false;
let mockFailedCount = 0;
let mockFailedErrorText: string | null = null;
let mockHasPendingUploads = true;
let mockSessionError: string | null = null;
const mockPause = jest.fn();
const mockCancel = jest.fn();
const mockResumeUploads = jest.fn();
const mockSyncNowFromHook = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockGoBack,
    push: mockPush,
  }),
}));

jest.mock('../../hooks/useDownloadQueue', () => ({
  useDownloadQueue: () => ({
    snapshot: { primaryProjectId: undefined },
    hasDownloads: false,
  }),
}));

jest.mock('../../hooks/useConnectivity', () => ({
  useConnectivity: () => ({
    isOnline: mockIsOnline,
    isWifi: !mockCellularBlocked,
  }),
}));

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({
    uploadOverCellular: false,
    setUploadOverCellular: jest.fn(),
  }),
}));

jest.mock('../../hooks/useSync', () => ({
  useSync: jest.fn(({ onSyncComplete }: { onSyncComplete?: () => void }) => {
    mockTriggerSync.mockImplementation(() => {
      onSyncComplete?.();
    });
    return {
      triggerSync: mockTriggerSync,
      isSyncing: mockIsSyncing,
      displayText: mockDisplayText,
      stateType: mockStateType,
    };
  }),
}));

jest.mock('../../hooks/usePendingUploads', () => ({
  usePendingUploads: () => ({
    hasPendingUploads: mockHasPendingUploads,
    hasFailedUploads: mockHasFailedUploads,
    failedCount: mockFailedCount,
    failedErrorText: mockFailedErrorText,
    pendingChapterCount: 1,
    isUploading: false,
    uploadProgress: null,
  }),
}));

jest.mock('../../hooks/useUploadSessionState', () => ({
  useUploadSessionState: () => ({
    pageStatus: mockPageStatus,
    progressUploaded: 0,
    progressTotal: 3,
    nextRetryAt: undefined,
    sessionError: mockSessionError,
    isControlPending: false,
    isStartControlPending: false,
    pause: mockPause,
    cancel: mockCancel,
    resumeUploads: mockResumeUploads,
    syncNowUploads: mockSyncNowFromHook,
  }),
}));

jest.mock('../../services/uploadOrchestrator', () => ({
  pauseUploadSession: (...args: unknown[]) => mockPauseUploadSession(...args),
  cancelUploadSession: (...args: unknown[]) => mockCancelUploadSession(...args),
  syncNowUploads: (...args: unknown[]) => mockSyncNowUploads(...args),
}));

jest.mock('react-native-svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockSvg = ({ children }: { children?: unknown }) =>
    MockReact.createElement(View, null, children);
  return {
    __esModule: true,
    default: MockSvg,
    Circle: MockSvg,
    Path: MockSvg,
    G: MockSvg,
  };
});

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    ChevronLeft: MockIcon,
    Pause: MockIcon,
    Play: MockIcon,
    X: MockIcon,
  };
});

jest.mock('../../components/layout/ScreenContainer', () => ({
  ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../components/ui/CloudSyncStatusIcon', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    CloudSyncStatusIcon: () => MockReact.createElement(View),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('SyncScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPageStatus = 'pending';
    mockCellularBlocked = false;
    mockIsOnline = true;
    mockIsSyncing = false;
    mockDisplayText = 'Last synced: Just now';
    mockStateType = 'normal';
    mockHasFailedUploads = false;
    mockFailedCount = 0;
    mockFailedErrorText = null;
    mockHasPendingUploads = true;
    mockSessionError = null;
    mockPause.mockResolvedValue(undefined);
    mockCancel.mockResolvedValue(undefined);
    mockResumeUploads.mockResolvedValue(undefined);
    mockSyncNowFromHook.mockResolvedValue(undefined);
  });

  it('calls syncNowUploads and triggerSync when Sync Now is pressed', async () => {
    render(<SyncScreen />);

    fireEvent.press(screen.getByTestId('sync-action-sync-now'));

    await waitFor(() => {
      expect(mockSyncNowFromHook).toHaveBeenCalledTimes(1);
      expect(mockTriggerSync).toHaveBeenCalledTimes(1);
    });
  });

  it('calls pause when Pause is pressed during syncing', async () => {
    mockPageStatus = 'syncing';
    render(<SyncScreen />);

    fireEvent.press(screen.getByTestId('sync-action-pause'));

    await waitFor(() => {
      expect(mockPause).toHaveBeenCalledTimes(1);
    });
  });

  it('calls cancel when Cancel is pressed during syncing', async () => {
    mockPageStatus = 'syncing';
    render(<SyncScreen />);

    fireEvent.press(screen.getByTestId('sync-action-cancel'));

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('calls syncNowUploads and triggerSync when Resume is pressed', async () => {
    mockPageStatus = 'paused';
    render(<SyncScreen />);

    fireEvent.press(screen.getByTestId('sync-action-resume'));

    await waitFor(() => {
      expect(mockSyncNowFromHook).toHaveBeenCalledTimes(1);
      expect(mockTriggerSync).toHaveBeenCalledTimes(1);
    });
  });

  it('calls syncNowUploads but not triggerSync on Resume when metadata sync is in flight', async () => {
    mockPageStatus = 'paused';
    mockIsSyncing = true;
    render(<SyncScreen />);

    fireEvent.press(screen.getByTestId('sync-action-resume'));

    await waitFor(() => {
      expect(mockSyncNowFromHook).toHaveBeenCalledTimes(1);
      expect(mockTriggerSync).not.toHaveBeenCalled();
    });
  });

  it('still calls syncNowUploads when Sync Now is pressed during metadata sync', async () => {
    mockIsSyncing = true;
    render(<SyncScreen />);

    fireEvent.press(screen.getByTestId('sync-action-sync-now'));

    await waitFor(() => {
      expect(mockSyncNowFromHook).toHaveBeenCalledTimes(1);
      expect(mockTriggerSync).not.toHaveBeenCalled();
    });
  });

  it('disables Sync Now when cellular is blocked', () => {
    mockCellularBlocked = true;
    render(<SyncScreen />);

    expect(screen.getByTestId('sync-action-sync-now')).toBeDisabled();
    expect(
      screen.getByTestId('sync-action-sync-now-disabled-hint'),
    ).toBeTruthy();
  });

  it('shows metadata sync failures from useSync', () => {
    mockStateType = 'error';
    mockDisplayText = 'Sync failed: chapter claims';
    render(<SyncScreen />);

    expect(screen.getByTestId('sync-metadata-error')).toHaveTextContent(
      'Sync failed: chapter claims',
    );
  });

  it('shows sanitized upload_error when selected takes have failed', () => {
    mockHasFailedUploads = true;
    mockFailedCount = 1;
    mockFailedErrorText =
      'Audio storage is currently unavailable. Try again later.';
    render(<SyncScreen />);

    expect(screen.getByTestId('sync-failed-error')).toHaveTextContent(
      'Audio storage is currently unavailable. Try again later.',
    );
  });

  it('does not show sync-failed-error when failed uploads have no upload_error text', () => {
    mockHasFailedUploads = true;
    mockFailedCount = 1;
    mockFailedErrorText = null;
    render(<SyncScreen />);

    expect(screen.queryByTestId('sync-failed-error')).toBeNull();
  });

  it('shows failed upload detail while offline', () => {
    mockIsOnline = false;
    mockHasFailedUploads = true;
    mockHasPendingUploads = false;
    mockFailedCount = 1;
    mockFailedErrorText =
      'Missing projectUnitId for recording (no matching chapter assignment)';
    render(<SyncScreen />);

    expect(screen.getByTestId('sync-failed-error')).toHaveTextContent(
      'Missing projectUnitId for recording (no matching chapter assignment)',
    );
    expect(screen.queryByText(/Open Sync page to retry\./)).toBeNull();
  });
});
