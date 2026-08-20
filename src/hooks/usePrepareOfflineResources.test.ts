import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  usePrepareOfflineResources,
  UsePrepareOfflineResourcesInput,
} from './usePrepareOfflineResources';
import { PrepareOfflineChapterRow } from '../types/prepareOffline/types';
import {
  resetMockPrepareOfflineInventory,
  setMockPrepareOfflineResourceStatus,
  setPrepareOfflineMockInventoryScenario,
  getMockPrepareOfflineResourceStatus,
  DEV_MOCK_FILE_BYTES,
} from '../mocks/prepareOffline';
import { scopedPrepareOfflineResourceId } from '../utils/prepareOfflineResourceId';

const TIER3_MOCK_TOTAL =
  2 * DEV_MOCK_FILE_BYTES.text +
  2 * DEV_MOCK_FILE_BYTES.audio +
  DEV_MOCK_FILE_BYTES.image;

function chapter(id: number): PrepareOfflineChapterRow {
  return {
    id,
    bookId: 1,
    bookCode: 'GEN',
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
    expect(result.current.selectedItems.length).toBeGreaterThan(0);
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
      result.current.toggleItemSelected(
        scopedPrepareOfflineResourceId(99, 2, 'Translation Questions', 'text'),
      );
    });

    expect(result.current.pendingBytes).toBe(
      initialPending - DEV_MOCK_FILE_BYTES.text,
    );
    expect(result.current.totalBytes).toBe(
      initialTotal - DEV_MOCK_FILE_BYTES.text,
    );
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
      result.current.toggleItemSelected(
        scopedPrepareOfflineResourceId(1, 3, 'Bible Commentary', 'text'),
      );
    });

    expect(
      result.current.isItemSelected(
        scopedPrepareOfflineResourceId(1, 3, 'Bible Commentary', 'text'),
      ),
    ).toBe(false);

    rerender({
      projectId: 2,
      userId: 42,
      chapters: [chapter(2)],
      selectedIds: new Set([2]),
      selectedCount: 1,
      isAssignedUser: true,
    });

    await waitForCatalogItems(result);

    expect(
      result.current.isItemSelected(
        scopedPrepareOfflineResourceId(2, 3, 'Bible Commentary', 'text'),
      ),
    ).toBe(true);
  });

  it('resets deselected items when account changes on the same project', async () => {
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
      result.current.toggleItemSelected(
        scopedPrepareOfflineResourceId(1, 3, 'Bible Commentary', 'text'),
      );
    });

    expect(
      result.current.isItemSelected(
        scopedPrepareOfflineResourceId(1, 3, 'Bible Commentary', 'text'),
      ),
    ).toBe(false);

    rerender({
      projectId: 1,
      userId: 99,
      chapters: [chapter(1)],
      selectedIds: new Set([1]),
      selectedCount: 1,
      isAssignedUser: true,
    });

    await waitForCatalogItems(result);

    expect(
      result.current.isItemSelected(
        scopedPrepareOfflineResourceId(1, 3, 'Bible Commentary', 'text'),
      ),
    ).toBe(true);
  });

  it('preserves completed inventory after Prepare Offline remount', async () => {
    setPrepareOfflineMockInventoryScenario('fresh');
    const notesId = 'tier-1-translation-notes-text';

    const { result, unmount } = renderHook(() =>
      usePrepareOfflineResources({
        projectId: 374,
        userId: 42,
        chapters: [chapter(1)],
        selectedIds: new Set([1]),
        selectedCount: 1,
        isAssignedUser: true,
      }),
    );

    await waitForCatalogItems(result);

    act(() => {
      setMockPrepareOfflineResourceStatus(374, notesId, 'completed');
    });

    expect(getMockPrepareOfflineResourceStatus(374, notesId)).toBe('completed');

    unmount();

    const remounted = renderHook(() =>
      usePrepareOfflineResources({
        projectId: 374,
        userId: 42,
        chapters: [chapter(1)],
        selectedIds: new Set([1]),
        selectedCount: 1,
        isAssignedUser: true,
      }),
    );

    await waitForCatalogItems(remounted.result);

    expect(getMockPrepareOfflineResourceStatus(374, notesId)).toBe('completed');
    remounted.unmount();
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

    expect(
      result.current.isItemSelected(
        scopedPrepareOfflineResourceId(88, 3, 'Bible Commentary', 'text'),
      ),
    ).toBe(false);
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

    expect(
      result.current.isItemSelected(
        scopedPrepareOfflineResourceId(77, 3, 'Bible Commentary', 'text'),
      ),
    ).toBe(true);
    expect(result.current.pendingBytes).toBe(TIER3_MOCK_TOTAL);
  });
});
