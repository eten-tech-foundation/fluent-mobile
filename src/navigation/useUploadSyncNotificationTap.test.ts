import { renderHook, waitFor } from '@testing-library/react-native';
import { useUploadSyncNotificationTap } from './useUploadSyncNotificationTap';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

let mockIsAuthenticated = true;
let mockIsLoading = false;

jest.mock('./AuthSessionProvider', () => ({
  useAuthSession: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
  }),
}));

const mockGetLastNotificationResponse = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn(
  (_listener?: unknown) => ({
    remove: jest.fn(),
  }),
);

jest.mock('expo-notifications', () => ({
  getLastNotificationResponse: () => mockGetLastNotificationResponse(),
  addNotificationResponseReceivedListener: (listener: unknown) =>
    mockAddNotificationResponseReceivedListener(listener),
}));

const uploadNotification = {
  request: {
    identifier: 'upload-sync-progress',
    content: { data: { kind: 'upload-sync' } },
  },
};

describe('useUploadSyncNotificationTap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockGetLastNotificationResponse.mockReturnValue(null);
  });

  it('waits until bootstrap finishes before a tap can open Sync', async () => {
    mockIsLoading = true;
    mockGetLastNotificationResponse.mockReturnValue({
      notification: uploadNotification,
    });

    const view = await renderHook(() => useUploadSyncNotificationTap());

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    mockIsLoading = false;
    await view.rerender(undefined);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(app)/(stack)/sync');
    });
  });

  it('opens Sync when a logged-in user taps the local upload notification', async () => {
    mockGetLastNotificationResponse.mockReturnValue({
      notification: uploadNotification,
    });

    await renderHook(() => useUploadSyncNotificationTap());

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(app)/(stack)/sync');
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('opens login when logged out, then Sync after sign-in', async () => {
    mockIsAuthenticated = false;
    mockGetLastNotificationResponse.mockReturnValue({
      notification: uploadNotification,
    });

    const { rerender } = await renderHook(() => useUploadSyncNotificationTap());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
    expect(mockPush).not.toHaveBeenCalled();

    mockIsAuthenticated = true;
    await rerender(undefined);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(app)/(stack)/sync');
    });
  });
});
