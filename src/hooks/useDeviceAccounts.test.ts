const mockGetActiveUserId = jest.fn();
const mockGetKnownUserIds = jest.fn();
const mockGetUserEmail = jest.fn();
const mockGetUserById = jest.fn();

jest.mock('../services/storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
  getKnownUserIds: () => mockGetKnownUserIds(),
  getUserEmail: (userId: string) => mockGetUserEmail(userId),
  MAX_DEVICE_ACCOUNTS: 3,
}));

jest.mock('../db/queries', () => ({
  getUserById: (userId: number) => mockGetUserById(userId),
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

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDeviceAccounts } from './useDeviceAccounts';

describe('useDeviceAccounts', () => {
  beforeEach(() => {
    mockGetActiveUserId.mockReset();
    mockGetKnownUserIds.mockReset();
    mockGetUserEmail.mockReset();
    mockGetUserById.mockReset();

    mockGetActiveUserId.mockReturnValue('1');
    mockGetKnownUserIds.mockReturnValue(['1', '2']);
    mockGetUserEmail.mockImplementation(
      (userId: string) => `${userId}@example.com`,
    );
    mockGetUserById.mockResolvedValue(null);
  });

  it('does not load accounts when the panel is hidden', async () => {
    const { result } = renderHook(() => useDeviceAccounts(false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.accounts).toEqual([]);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('loads known accounts with active flag and display metadata', async () => {
    mockGetUserById.mockImplementation(async (userId: number) =>
      userId === 1
        ? {
            id: 1,
            email: 'one@fluent.local',
            firstName: 'Ada',
            lastName: 'Lovelace',
          }
        : null,
    );

    const { result } = renderHook(() => useDeviceAccounts(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.accounts).toEqual([
      {
        userId: '1',
        displayName: 'Ada Lovelace',
        email: 'one@fluent.local',
        initials: 'AL',
        isActive: true,
      },
      {
        userId: '2',
        displayName: '2@example.com',
        email: '2@example.com',
        initials: '2',
        isActive: false,
      },
    ]);
    expect(result.current.activeUserId).toBe('1');
    expect(result.current.accountCount).toBe(2);
  });

  it('reports account limit when known ids reach MAX_DEVICE_ACCOUNTS', async () => {
    mockGetKnownUserIds.mockReturnValue(['1', '2', '3']);

    const { result } = renderHook(() => useDeviceAccounts(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasAccountLimit).toBe(true);
  });

  it('reload refreshes accounts after visibility is enabled', async () => {
    mockGetKnownUserIds.mockReturnValue(['1']);

    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useDeviceAccounts(visible),
      { initialProps: { visible: false } },
    );

    rerender({ visible: true });

    await waitFor(() => {
      expect(result.current.accounts).toHaveLength(1);
    });

    mockGetKnownUserIds.mockReturnValue(['1', '2']);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.accounts).toHaveLength(2);
  });
});
