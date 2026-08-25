import { renderHook } from '@testing-library/react-native';
import { isDevPreviewChapterConflictEnabled } from '../config/devPreviewChapterConflict';
import { useChapterConflictStatus } from './useChapterConflictStatus';

jest.mock('../config/devPreviewChapterConflict', () => ({
  isDevPreviewChapterConflictEnabled: jest.fn(() => false),
}));

describe('useChapterConflictStatus', () => {
  beforeEach(() => {
    jest.mocked(isDevPreviewChapterConflictEnabled).mockReturnValue(false);
  });

  it('returns no conflict from the stub implementation', () => {
    const { result } = renderHook(() => useChapterConflictStatus(1));

    expect(result.current).toEqual({ hasConflict: false });
  });

  it('returns conflict when dev preview is enabled', () => {
    jest.mocked(isDevPreviewChapterConflictEnabled).mockReturnValue(true);

    const { result } = renderHook(() => useChapterConflictStatus(1));

    expect(result.current).toEqual({ hasConflict: true });
  });
});
