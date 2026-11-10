import { renderHook, waitFor } from '@testing-library/react-native';
import {
  resetLocalSyncHealthForTests,
  useLocalSyncHealth,
} from './useLocalSyncHealth';
import {
  countChaptersMissingBibleText,
  getDatabaseWriteMark,
  sameDatabaseWrites,
} from '../db/queries';
import { userNeedsAssigneeRepair } from '../db/repository';
import { parseUserId } from '../utils/parseUserId';

jest.mock('../db/repository', () => ({
  userNeedsAssigneeRepair: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getDatabaseWriteMark: jest.fn(() => Promise.resolve(null)),
  sameDatabaseWrites: jest.fn(() => false),
  countChaptersMissingBibleText: jest.fn(),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(),
}));

const mockUserNeedsAssigneeRepair = userNeedsAssigneeRepair as jest.Mock;
const mockCountChaptersMissingBibleText =
  countChaptersMissingBibleText as jest.Mock;
const mockParseUserId = parseUserId as jest.Mock;
const mockWriteMark = getDatabaseWriteMark as jest.Mock;
const mockSameWrites = sameDatabaseWrites as jest.Mock;

describe('useLocalSyncHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetLocalSyncHealthForTests();
    mockWriteMark.mockResolvedValue(null);
    mockSameWrites.mockReturnValue(false);
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

  describe('when nothing was written since the last check', () => {
    const connection = {};
    let changes = 10;

    beforeEach(() => {
      changes = 10;
      mockWriteMark.mockImplementation(() =>
        Promise.resolve({ connection, changes }),
      );
      mockSameWrites.mockImplementation(
        (a, b) =>
          a !== null &&
          b !== null &&
          a.connection === b.connection &&
          a.changes === b.changes,
      );
      mockUserNeedsAssigneeRepair.mockResolvedValue(true);
      mockCountChaptersMissingBibleText.mockResolvedValue(3);
    });

    async function mountChecked() {
      const hook = renderHook(() => useLocalSyncHealth());
      await waitFor(() => expect(hook.result.current.checking).toBe(false));
      return hook;
    }

    it('shows the last answer without reading again', async () => {
      (await mountChecked()).unmount();

      const { result } = await mountChecked();

      expect(result.current).toMatchObject({
        needsDownloadSync: true,
        missingTextChapters: 3,
      });
      expect(mockUserNeedsAssigneeRepair).toHaveBeenCalledTimes(1);
      expect(mockCountChaptersMissingBibleText).toHaveBeenCalledTimes(1);
    });

    it('reads again after a write', async () => {
      (await mountChecked()).unmount();
      changes = 11;
      mockCountChaptersMissingBibleText.mockResolvedValue(2);

      const { result } = await mountChecked();

      expect(result.current.missingTextChapters).toBe(2);
      expect(mockCountChaptersMissingBibleText).toHaveBeenCalledTimes(2);
    });

    it('reads again for another user', async () => {
      (await mountChecked()).unmount();
      mockParseUserId.mockReturnValue(242);
      mockCountChaptersMissingBibleText.mockResolvedValue(0);

      const { result } = await mountChecked();

      expect(result.current.missingTextChapters).toBe(0);
      expect(mockCountChaptersMissingBibleText).toHaveBeenLastCalledWith([242]);
    });

    it('reads again after a failed read', async () => {
      mockCountChaptersMissingBibleText.mockRejectedValueOnce(
        new Error('busy'),
      );
      (await mountChecked()).unmount();

      const { result } = await mountChecked();

      expect(result.current.missingTextChapters).toBe(3);
      expect(mockCountChaptersMissingBibleText).toHaveBeenCalledTimes(2);
    });

    it('reads again when the write count is unreadable', async () => {
      (await mountChecked()).unmount();
      mockWriteMark.mockResolvedValue(null);

      await mountChecked();

      expect(mockCountChaptersMissingBibleText).toHaveBeenCalledTimes(2);
    });
  });
});
