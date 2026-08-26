const mockGetActiveUserId = jest.fn();
const mockGetKnownUserIds = jest.fn();
const mockGetUserEmail = jest.fn();
const mockGetUserById = jest.fn();

jest.mock('../services/storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
  getKnownUserIds: () => mockGetKnownUserIds(),
  getUserEmail: (userId: string) => mockGetUserEmail(userId),
}));

jest.mock('../db/queries', () => ({
  getUserById: (userId: number) => mockGetUserById(userId),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useActiveAccountSummary } from './useActiveAccountSummary';

describe('useActiveAccountSummary', () => {
  beforeEach(() => {
    mockGetActiveUserId.mockReset();
    mockGetKnownUserIds.mockReset();
    mockGetUserEmail.mockReset();
    mockGetUserById.mockReset();

    mockGetKnownUserIds.mockReturnValue(['1', '2']);
    mockGetUserEmail.mockReturnValue('fallback@example.com');
  });

  it('returns an empty summary when no active user is set', async () => {
    mockGetActiveUserId.mockReturnValue('');

    const { result } = renderHook(() => useActiveAccountSummary());

    await waitFor(() => {
      expect(result.current.activeUserId).toBe('');
    });

    expect(result.current.email).toBe('');
    expect(result.current.accountCount).toBe(2);
    expect(result.current.hasMultipleAccounts).toBe(true);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('loads profile fields from SQLite with storage email fallback', async () => {
    mockGetActiveUserId.mockReturnValue('7');
    mockGetUserById.mockResolvedValue({
      id: 7,
      email: 'db@example.com',
      firstName: 'Grace',
      lastName: 'Hopper',
    });

    const { result } = renderHook(() => useActiveAccountSummary());

    await waitFor(() => {
      expect(result.current.email).toBe('db@example.com');
    });

    expect(result.current).toMatchObject({
      activeUserId: '7',
      firstName: 'Grace',
      lastName: 'Hopper',
      accountCount: 2,
      hasMultipleAccounts: true,
    });
  });

  it('falls back to stored email when the user row is missing', async () => {
    mockGetActiveUserId.mockReturnValue('9');
    mockGetUserById.mockResolvedValue(null);
    mockGetUserEmail.mockReturnValue('stored@example.com');

    const { result } = renderHook(() => useActiveAccountSummary());

    await waitFor(() => {
      expect(result.current.email).toBe('stored@example.com');
    });
  });

  it('refresh reloads summary when refreshKey changes', async () => {
    mockGetActiveUserId.mockReturnValue('1');
    mockGetUserById.mockResolvedValue({
      id: 1,
      email: 'first@example.com',
      firstName: 'First',
      lastName: 'User',
    });

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) =>
        useActiveAccountSummary(refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => {
      expect(result.current.email).toBe('first@example.com');
    });

    mockGetUserById.mockResolvedValue({
      id: 1,
      email: 'updated@example.com',
      firstName: 'Updated',
      lastName: 'User',
    });

    rerender({ refreshKey: 1 });

    await waitFor(() => {
      expect(result.current.email).toBe('updated@example.com');
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.firstName).toBe('Updated');
  });
});
