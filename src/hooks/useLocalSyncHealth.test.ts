import { renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSyncHealth } from './useLocalSyncHealth';
import { countChaptersMissingBibleText } from '../db/queries';
import { userNeedsAssigneeRepair } from '../db/repository';
import { parseUserId } from '../utils/parseUserId';

jest.mock('../db/repository', () => ({
  userNeedsAssigneeRepair: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  countChaptersMissingBibleText: jest.fn(),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(),
}));

const mockUserNeedsAssigneeRepair = userNeedsAssigneeRepair as jest.Mock;
const mockCountChaptersMissingBibleText =
  countChaptersMissingBibleText as jest.Mock;
const mockParseUserId = parseUserId as jest.Mock;

describe('useLocalSyncHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseUserId.mockReturnValue(241);
    mockUserNeedsAssigneeRepair.mockResolvedValue(false);
    mockCountChaptersMissingBibleText.mockResolvedValue(0);
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
    expect(mockCountChaptersMissingBibleText).not.toHaveBeenCalled();
  });

  it('reports chapters whose text a sync could still fetch', async () => {
    mockCountChaptersMissingBibleText.mockResolvedValue(1071);

    const { result } = renderHook(() => useLocalSyncHealth());

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.missingTextChapters).toBe(1071);
    // Text gaps must not pull Home's assignee auto-repair in with them.
    expect(result.current.needsDownloadSync).toBe(false);
    expect(mockCountChaptersMissingBibleText).toHaveBeenCalledWith([241]);
  });

  it('still counts missing text when the assignee check fails', async () => {
    mockUserNeedsAssigneeRepair.mockRejectedValue(new Error('db gone'));
    mockCountChaptersMissingBibleText.mockResolvedValue(4);

    const { result } = renderHook(() => useLocalSyncHealth());

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.needsDownloadSync).toBe(false);
    expect(result.current.missingTextChapters).toBe(4);
  });

  it('reports no text gap when the count fails', async () => {
    mockCountChaptersMissingBibleText.mockRejectedValue(new Error('db gone'));

    const { result } = renderHook(() => useLocalSyncHealth());

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.missingTextChapters).toBe(0);
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
