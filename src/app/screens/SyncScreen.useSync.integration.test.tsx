import React from 'react';
import { render, screen } from '@testing-library/react-native';

const mockGetSyncError = jest.fn();
const mockGetSyncState = jest.fn();

jest.mock('../../services/storage', () => ({
  KV_KEYS: {
    SYNC_ERROR_USER: 'sync_error_user',
    SYNC_ERROR_MASTER_DATA: 'sync_error_master_data',
    SYNC_ERROR_PROJECTS: 'sync_error_projects',
    SYNC_ERROR_CHAPTER_CLAIMS: 'sync_error_chapter_claims',
    SYNC_ERROR_CHAPTER_ASSIGNMENTS: 'sync_error_chapter_assignments',
    SYNC_ERROR_PROJECT_UNITS: 'sync_error_project_units',
    SYNC_ERROR_BIBLE_TEXTS: 'sync_error_bible_texts',
    SYNC_ERROR_PERICOPE_SETS: 'sync_error_pericope_sets',
    SYNC_ERROR_PERICOPES: 'sync_error_pericopes',
  },
  getSyncError: (key: string) => mockGetSyncError(key),
  getSyncState: () => mockGetSyncState(),
}));

jest.mock('../../services/sync', () => ({
  syncAllUsers: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
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
    isWifi: true,
  }),
}));

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({
    uploadOverCellular: false,
    setUploadOverCellular: jest.fn(),
  }),
}));

jest.mock('../../hooks/usePendingUploads', () => ({
  usePendingUploads: () => ({
    hasPendingUploads: false,
    hasFailedUploads: false,
    failedCount: 0,
    pendingChapterCount: 0,
    isUploading: false,
    uploadProgress: null,
  }),
}));

jest.mock('../../hooks/useUploadSessionState', () => ({
  useUploadSessionState: () => ({
    pageStatus: 'allComplete',
    progressUploaded: 0,
    progressTotal: 0,
    nextRetryAt: undefined,
    sessionError: null,
    isControlPending: false,
    isStartControlPending: false,
    pause: jest.fn(),
    cancel: jest.fn(),
    resumeUploads: jest.fn(),
    syncNowUploads: jest.fn(),
  }),
}));

jest.mock('../../services/uploadOrchestrator', () => ({
  pauseUploadSession: jest.fn(),
  cancelUploadSession: jest.fn(),
  syncNowUploads: jest.fn(),
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

import SyncScreen from './SyncScreen';
import { KV_KEYS } from '../../services/storage';

describe('SyncScreen metadata error via real useSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSyncState.mockReturnValue({
      lastSyncedAt: new Date().toISOString(),
      projectsCount: 1,
      chaptersCount: 1,
      biblesCount: 1,
    });
    mockGetSyncError.mockReturnValue(undefined);
  });

  it('renders SYNC_ERROR_CHAPTER_CLAIMS from KV through useSync', () => {
    mockGetSyncError.mockImplementation((key: string) =>
      key === KV_KEYS.SYNC_ERROR_CHAPTER_CLAIMS
        ? 'Failed to sync 1 pending chapter claim(s)'
        : undefined,
    );

    render(<SyncScreen />);

    expect(screen.getByTestId('sync-metadata-error')).toHaveTextContent(
      'Sync failed: chapter claims',
    );
  });

  it('joins multiple metadata sync failures from KV', () => {
    mockGetSyncError.mockImplementation((key: string) => {
      if (key === KV_KEYS.SYNC_ERROR_CHAPTER_CLAIMS) {
        return 'claim fail';
      }
      if (key === KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS) {
        return 'assignment fail';
      }
      return undefined;
    });

    render(<SyncScreen />);

    expect(screen.getByTestId('sync-metadata-error')).toHaveTextContent(
      'Sync failed: chapter claims, chapter assignments',
    );
  });
});
