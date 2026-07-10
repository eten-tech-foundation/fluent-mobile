import { renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSyncHealth } from './useLocalSyncHealth';
import { userNeedsAssigneeRepair } from '../db/repository';
import { parseUserId } from '../utils/parseUserId';

jest.mock('../db/repository', () => ({
  userNeedsAssigneeRepair: jest.fn(),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(),
}));

const mockUserNeedsAssigneeRepair = userNeedsAssigneeRepair as jest.Mock;
const mockParseUserId = parseUserId as jest.Mock;

describe('useLocalSyncHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseUserId.mockReturnValue(241);
    mockUserNeedsAssigneeRepair.mockResolvedValue(false);
  });

  it('reports needsDownloadSync when assignee repair is required', async () => {
    mockUserNeedsAssigneeRepair.mockResolvedValue(true);

    const { result } = renderHook(() => useLocalSyncHealth());

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.needsDownloadSync).toBe(true);
    expect(mockUserNeedsAssigneeRepair).toHaveBeenCalledWith(241);
  });

  it('reports healthy when assignee repair is not required', async () => {
    const { result } = renderHook(() => useLocalSyncHealth());

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.needsDownloadSync).toBe(false);
  });

  it('skips repair check when no user is signed in', async () => {
    mockParseUserId.mockReturnValue(null);

    const { result } = renderHook(() => useLocalSyncHealth());

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.needsDownloadSync).toBe(false);
    expect(mockUserNeedsAssigneeRepair).not.toHaveBeenCalled();
  });

  it('re-checks when refreshKey changes', async () => {
    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) =>
        useLocalSyncHealth(refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    mockUserNeedsAssigneeRepair.mockResolvedValue(true);
    rerender({ refreshKey: 1 });

    await waitFor(() => {
      expect(result.current.needsDownloadSync).toBe(true);
    });

    expect(mockUserNeedsAssigneeRepair).toHaveBeenCalledTimes(2);
  });
});
