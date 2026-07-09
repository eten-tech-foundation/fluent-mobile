import { renderHook, act, waitFor } from '@testing-library/react-native';
import { usePrepareOfflineSelection } from './usePrepareOfflineSelection';
import { getPrepareOfflineChapters } from '../db/queries.prepareOffline';

jest.mock('../db/queries.prepareOffline', () => ({
  getPrepareOfflineChapters: jest.fn(),
}));

const mockGetChapters = getPrepareOfflineChapters as jest.Mock;

describe('usePrepareOfflineSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pre-selects assigned chapters and collapses accordion for assigned users', async () => {
    mockGetChapters.mockResolvedValue([
      {
        id: 1,
        bookId: 10,
        bookName: 'Genesis',
        chapterNumber: 1,
        assignedUserId: 42,
      },
      {
        id: 2,
        bookId: 10,
        bookName: 'Genesis',
        chapterNumber: 2,
        assignedUserId: null,
      },
    ]);

    const { result } = renderHook(() => usePrepareOfflineSelection(1, 42));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAssignedUser).toBe(true);
    expect(result.current.selectedIds.has(1)).toBe(true);
    expect(result.current.selectedIds.has(2)).toBe(false);
    expect(result.current.accordionExpanded).toBe(false);
    expect(result.current.accordionTitle).toBe('Assigned chapters (1)');
  });

  it('starts empty with expanded accordion for unassigned users', async () => {
    mockGetChapters.mockResolvedValue([
      {
        id: 1,
        bookId: 10,
        bookName: 'Genesis',
        chapterNumber: 1,
        assignedUserId: null,
      },
    ]);

    const { result } = renderHook(() => usePrepareOfflineSelection(1, 42));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAssignedUser).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.accordionExpanded).toBe(true);
    expect(result.current.accordionTitle).toBe('Selected chapters (0)');
  });

  it('toggles chapter and book selection', async () => {
    mockGetChapters.mockResolvedValue([
      {
        id: 1,
        bookId: 10,
        bookName: 'Genesis',
        chapterNumber: 1,
        assignedUserId: null,
      },
      {
        id: 2,
        bookId: 10,
        bookName: 'Genesis',
        chapterNumber: 2,
        assignedUserId: null,
      },
    ]);

    const { result } = renderHook(() => usePrepareOfflineSelection(1, 42));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.toggleChapter(1);
    });
    expect(result.current.selectedIds.has(1)).toBe(true);

    act(() => {
      result.current.toggleBook(result.current.books[0]);
    });
    expect(result.current.selectedIds.has(1)).toBe(true);
    expect(result.current.selectedIds.has(2)).toBe(true);

    act(() => {
      result.current.toggleBook(result.current.books[0]);
    });
    expect(result.current.selectedIds.size).toBe(0);
  });
});
