import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import SyncScreen from './SyncScreen';

const mockGoBack = jest.fn();
const mockTriggerSync = jest.fn();
const mockPauseUploadSession = jest.fn();
const mockCancelUploadSession = jest.fn();
const mockSyncNowUploads = jest.fn();

let mockPageStatus = 'pending';
let mockCellularBlocked = false;
let mockIsSyncing = false;
const mockPause = jest.fn();
const mockCancel = jest.fn();
const mockResumeUploads = jest.fn();
const mockSyncNowFromHook = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: jest.fn(),
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
    isOnline: true,
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
    };
  }),
}));

jest.mock('../../hooks/usePendingUploads', () => ({
  usePendingUploads: () => ({
    hasPendingUploads: true,
    hasFailedUploads: false,
    failedCount: 0,
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
    sessionError: null,
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
    mockIsSyncing = false;
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
});
