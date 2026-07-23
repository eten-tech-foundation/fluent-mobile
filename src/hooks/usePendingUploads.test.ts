import { loadPendingUploadCount, usePendingUploads } from './usePendingUploads';
import { renderHook, waitFor } from '@testing-library/react-native';

jest.mock('../db/queries', () => ({
  getPendingUploadCount: jest.fn(),
}));

import { getPendingUploadCount } from '../db/queries';

const mockGetPendingUploadCount = getPendingUploadCount as jest.MockedFunction<
  typeof getPendingUploadCount
>;

describe('usePendingUploads', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('loadPendingUploadCount returns the query count', async () => {
    mockGetPendingUploadCount.mockResolvedValue(3);
    await expect(loadPendingUploadCount()).resolves.toBe(3);
  });

  it('loadPendingUploadCount returns 0 on failure', async () => {
    mockGetPendingUploadCount.mockRejectedValue(new Error('db'));
    await expect(loadPendingUploadCount()).resolves.toBe(0);
  });

  it('exposes pendingCount and hasPendingUploads from the query', async () => {
    mockGetPendingUploadCount.mockResolvedValue(2);
    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(2);
      expect(result.current.hasPendingUploads).toBe(true);
    });
  });
});
