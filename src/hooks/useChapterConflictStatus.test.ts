import { renderHook, waitFor } from '@testing-library/react-native';
import { isDevPreviewChapterConflictEnabled } from '../config/devPreviewChapterConflict';
import { getChapterHasConflict } from '../db/queries';
import { useChapterConflictStatus } from './useChapterConflictStatus';

jest.mock('../config/devPreviewChapterConflict', () => ({
  isDevPreviewChapterConflictEnabled: jest.fn(() => false),
}));

jest.mock('../db/queries', () => ({
  getChapterHasConflict: jest.fn(),
}));

describe('useChapterConflictStatus', () => {
  beforeEach(() => {
    jest.mocked(isDevPreviewChapterConflictEnabled).mockReturnValue(false);
    jest.mocked(getChapterHasConflict).mockReset();
    jest.mocked(getChapterHasConflict).mockResolvedValue(false);
  });

  it('loads hasConflict from SQLite', async () => {
    jest.mocked(getChapterHasConflict).mockResolvedValue(true);

    const { result } = renderHook(() => useChapterConflictStatus(42));

    await waitFor(() => {
      expect(result.current).toEqual({ hasConflict: true });
    });
    expect(getChapterHasConflict).toHaveBeenCalledWith(42);
  });

  it('returns no conflict when SQLite reports clean', async () => {
    const { result } = renderHook(() => useChapterConflictStatus(1));

    await waitFor(() => {
      expect(result.current).toEqual({ hasConflict: false });
    });
  });

  it('resets conflict while loading a different chapter', async () => {
    jest
      .mocked(getChapterHasConflict)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useChapterConflictStatus(id),
      { initialProps: { id: 1 } },
    );

    await waitFor(() => {
      expect(result.current).toEqual({ hasConflict: true });
    });

    rerender({ id: 2 });

    await waitFor(() => {
      expect(result.current).toEqual({ hasConflict: false });
    });
    expect(getChapterHasConflict).toHaveBeenLastCalledWith(2);
  });
});
