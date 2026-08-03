import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  usePrepareOfflineResources,
  UsePrepareOfflineResourcesInput,
} from './usePrepareOfflineResources';
import { PrepareOfflineChapterRow } from '../types/prepareOffline/types';
import {
  resetMockPrepareOfflineInventory,
  setPrepareOfflineMockInventoryScenario,
} from '../mocks/prepareOffline';
import { setPrepareOfflineDownloadStarted } from '../services/storage';
import { enqueuePrepareOfflineDownload } from '../services/prepareOfflineDownload';

jest.mock('../services/storage', () => ({
  setPrepareOfflineDownloadStarted: jest.fn(),
}));

jest.mock('../services/prepareOfflineDownload', () => ({
  enqueuePrepareOfflineDownload: jest.fn(),
}));

const MB = 1024 * 1024;

function chapter(id: number): PrepareOfflineChapterRow {
  return {
    id,
    bookId: 1,
    bookName: 'Genesis',
    chapterNumber: id,
    assignedUserId: null,
  };
}

async function waitForCatalogItems(result: {
  current: ReturnType<typeof usePrepareOfflineResources>;
}) {
  await waitFor(() => {
    expect(result.current.catalog.items.length).toBeGreaterThan(0);
  });
}

describe('usePrepareOfflineResources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockPrepareOfflineInventory();
    setPrepareOfflineMockInventoryScenario('fresh');
  });

  it('disables download for unassigned users with no chapter selection', () => {
    const { result } = renderHook(() =>
      usePrepareOfflineResources({
        projectId: 1,
        userId: 42,
        chapters: [chapter(1)],
        selectedIds: new Set(),
        selectedCount: 0,
        isAssignedUser: false,
      }),
    );

    expect(result.current.canDownload).toBe(false);
    expect(result.current.catalog.items).toHaveLength(0);
  });

  it('enables download for assigned users when catalog is valid', async () => {
    const { result } = renderHook(() =>
      usePrepareOfflineResources({
        projectId: 1,
        userId: 42,
        chapters: [chapter(1)],
        selectedIds: new Set([1]),
        selectedCount: 1,
        isAssignedUser: true,
      }),
    );

    await waitForCatalogItems(result);

    expect(result.current.canDownload).toBe(true);
    expect(result.current.pendingBytes).toBeGreaterThan(0);
    expect(result.current.downloadButtonLabel).toMatch(/^Download /);
  });

  it('enables download for unassigned users after selecting a chapter', async () => {
    const { result, rerender } = renderHook(
      (props: UsePrepareOfflineResourcesInput) =>
        usePrepareOfflineResources(props),
      {
        initialProps: {
          projectId: 1,
          userId: 42,
          chapters: [chapter(1)],
          selectedIds: new Set<number>(),
          selectedCount: 0,
          isAssignedUser: false,
        },
      },
    );

    expect(result.current.canDownload).toBe(false);

    rerender({
      projectId: 1,
      userId: 42,
      chapters: [chapter(1)],
      selectedIds: new Set([1]),
      selectedCount: 1,
      isAssignedUser: false,
    });

    await waitForCatalogItems(result);

    expect(result.current.canDownload).toBe(true);
  });

  it('updates pending bytes when tier 2/3 items are deselected', async () => {
    setPrepareOfflineMockInventoryScenario('mixed');

    const { result } = renderHook(() =>
      usePrepareOfflineResources({
        projectId: 99,
        userId: 42,
        chapters: [chapter(1)],
        selectedIds: new Set([1]),
        selectedCount: 1,
        isAssignedUser: true,
      }),
    );

    await waitForCatalogItems(result);

    const initialPending = result.current.pendingBytes;
    const initialTotal = result.current.totalBytes;

    act(() => {
      result.current.toggleItemSelected('tier-2-translation-notes-text');
    });

    expect(result.current.pendingBytes).toBe(initialPending - 18 * MB);
    expect(result.current.totalBytes).toBe(initialTotal - 18 * MB);
  });

  it('resets deselected items when project changes', async () => {
    setPrepareOfflineMockInventoryScenario('fresh');

    const { result, rerender } = renderHook(
      (props: UsePrepareOfflineResourcesInput) =>
        usePrepareOfflineResources(props),
      {
        initialProps: {
          projectId: 1,
          userId: 42,
          chapters: [chapter(1)],
          selectedIds: new Set([1]),
          selectedCount: 1,
          isAssignedUser: true,
        },
      },
    );

    await waitForCatalogItems(result);

    act(() => {
      result.current.toggleItemSelected('tier-3-bible-commentary-text');
    });

    expect(result.current.isItemSelected('tier-3-bible-commentary-text')).toBe(
      false,
    );

    rerender({
      projectId: 2,
      userId: 42,
      chapters: [chapter(2)],
      selectedIds: new Set([2]),
      selectedCount: 1,
      isAssignedUser: true,
    });

    await waitForCatalogItems(result);

    expect(result.current.isItemSelected('tier-3-bible-commentary-text')).toBe(
      true,
    );
  });

  it('starts download via storage and enqueue stub', async () => {
    const { result } = renderHook(() =>
      usePrepareOfflineResources({
        projectId: 5,
        userId: 42,
        chapters: [chapter(1)],
        selectedIds: new Set([1]),
        selectedCount: 1,
        isAssignedUser: true,
      }),
    );

    await waitForCatalogItems(result);

    act(() => {
      result.current.handleDownload();
    });

    expect(setPrepareOfflineDownloadStarted).toHaveBeenCalledWith('42', 5);
    expect(enqueuePrepareOfflineDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        projectId: 5,
        items: expect.any(Array),
      }),
    );
    expect(result.current.downloadStarted).toBe(true);
  });

  it('deselects tier 3 by default in tier1-tier2 mock scenario', async () => {
    setPrepareOfflineMockInventoryScenario('tier1-tier2');

    const { result } = renderHook(() =>
      usePrepareOfflineResources({
        projectId: 88,
        userId: 42,
        chapters: [chapter(1)],
        selectedIds: new Set([1]),
        selectedCount: 1,
        isAssignedUser: true,
      }),
    );

    await waitForCatalogItems(result);

    expect(result.current.isItemSelected('tier-3-bible-commentary-text')).toBe(
      false,
    );
    expect(
      result.current.effectiveCatalog.groups.some(
        group => group.groupName === 'Bible Commentary',
      ),
    ).toBe(false);
  });

  it('includes tier 3 in the package for tier1-tier2-tier3-pending scenario', async () => {
    setPrepareOfflineMockInventoryScenario('tier1-tier2-tier3-pending');

    const { result } = renderHook(() =>
      usePrepareOfflineResources({
        projectId: 77,
        userId: 42,
        chapters: [chapter(1)],
        selectedIds: new Set([1]),
        selectedCount: 1,
        isAssignedUser: true,
      }),
    );

    await waitForCatalogItems(result);

    expect(result.current.isItemSelected('tier-3-bible-commentary-text')).toBe(
      true,
    );
    expect(result.current.pendingBytes).toBe(66 * MB);
  });
});
