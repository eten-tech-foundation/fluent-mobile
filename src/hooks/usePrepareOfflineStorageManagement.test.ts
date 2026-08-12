import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import {
  DELETE_OFFLINE_RESOURCES_CANCEL,
  DELETE_OFFLINE_RESOURCES_CONFIRM,
  DELETE_OFFLINE_RESOURCES_MESSAGE,
  DELETE_OFFLINE_RESOURCES_TITLE,
} from '../constants/messages';
import { usePrepareOfflineStorageManagement } from './usePrepareOfflineStorageManagement';

const mockGetDeviceStorageSummary = jest.fn();
const mockGetOtherProjectsStorageInventory = jest.fn();
const mockDeleteSelectedDownloadResources = jest.fn();

jest.mock('../services/prepareOfflineStorageManagement', () => ({
  getDeviceStorageSummary: () => mockGetDeviceStorageSummary(),
  getOtherProjectsStorageInventory: (projectId: number) =>
    mockGetOtherProjectsStorageInventory(projectId),
  deleteSelectedDownloadResources: (resources: unknown[], projectId: number) =>
    mockDeleteSelectedDownloadResources(resources, projectId),
}));

const summaryFixture = {
  availableBytes: 12.4 * 1024 * 1024 * 1024,
  totalDeviceBytes: 64 * 1024 * 1024 * 1024,
  fluentUsedBytes: 350,
};

const groupsFixture = [
  {
    projectId: 2,
    projectName: 'Mark',
    totalBytes: 250,
    resources: [
      {
        id: 'resource-b',
        projectId: 2,
        label: 'Translation Notes — Text',
        resourceName: 'Translation Notes',
        kind: 'text' as const,
        bytes: 250,
      },
    ],
  },
];

describe('usePrepareOfflineStorageManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDeviceStorageSummary.mockResolvedValue(summaryFixture);
    mockGetOtherProjectsStorageInventory.mockResolvedValue(groupsFixture);
    mockDeleteSelectedDownloadResources.mockResolvedValue({
      deletedIds: ['resource-b'],
      failed: [],
    });
  });

  it('loads storage summary and other-project inventory on mount', async () => {
    const { result } = renderHook(() => usePrepareOfflineStorageManagement(1));

    await waitFor(() => {
      expect(result.current.initialLoaded).toBe(true);
    });

    expect(mockGetDeviceStorageSummary).toHaveBeenCalled();
    expect(mockGetOtherProjectsStorageInventory).toHaveBeenCalledWith(1);
    expect(result.current.summary).toEqual(summaryFixture);
    expect(result.current.groups).toEqual(groupsFixture);
  });

  it('clears state when projectId is null', async () => {
    const { result } = renderHook(() =>
      usePrepareOfflineStorageManagement(null),
    );

    await waitFor(() => {
      expect(result.current.initialLoaded).toBe(true);
    });

    expect(mockGetDeviceStorageSummary).not.toHaveBeenCalled();
    expect(mockGetOtherProjectsStorageInventory).not.toHaveBeenCalled();
    expect(result.current.summary).toEqual({
      availableBytes: null,
      totalDeviceBytes: null,
      fluentUsedBytes: 0,
    });
    expect(result.current.groups).toEqual([]);
  });

  it('toggles resource selection and tracks bytes to free', async () => {
    const { result } = renderHook(() => usePrepareOfflineStorageManagement(1));

    await waitFor(() => {
      expect(result.current.initialLoaded).toBe(true);
    });

    act(() => {
      result.current.toggleResourceSelected('resource-b');
    });

    expect(result.current.hasSelection).toBe(true);
    expect(result.current.bytesToFree).toBe(250);
    expect(result.current.selectedIds.has('resource-b')).toBe(true);

    act(() => {
      result.current.toggleResourceSelected('resource-b');
    });

    expect(result.current.hasSelection).toBe(false);
    expect(result.current.bytesToFree).toBe(0);
  });

  it('toggles project accordion expansion', async () => {
    const { result } = renderHook(() => usePrepareOfflineStorageManagement(1));

    await waitFor(() => {
      expect(result.current.initialLoaded).toBe(true);
    });

    act(() => {
      result.current.toggleProjectExpanded(2);
    });
    expect(result.current.expandedProjectIds.has(2)).toBe(true);

    act(() => {
      result.current.toggleProjectExpanded(2);
    });
    expect(result.current.expandedProjectIds.has(2)).toBe(false);
  });

  it('shows delete confirmation dialog with ticket copy', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);

    const { result } = renderHook(() => usePrepareOfflineStorageManagement(1));

    await waitFor(() => {
      expect(result.current.initialLoaded).toBe(true);
    });

    act(() => {
      result.current.toggleResourceSelected('resource-b');
    });

    act(() => {
      result.current.requestDeleteSelected();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      DELETE_OFFLINE_RESOURCES_TITLE,
      DELETE_OFFLINE_RESOURCES_MESSAGE,
      expect.arrayContaining([
        expect.objectContaining({ text: DELETE_OFFLINE_RESOURCES_CANCEL }),
        expect.objectContaining({
          text: DELETE_OFFLINE_RESOURCES_CONFIRM,
          style: 'destructive',
        }),
      ]),
    );
  });

  it('deletes selected resources after confirmation and reloads inventory', async () => {
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        const confirm = buttons?.find(
          button => button.text === DELETE_OFFLINE_RESOURCES_CONFIRM,
        );
        confirm?.onPress?.();
      });

    const { result } = renderHook(() => usePrepareOfflineStorageManagement(1));

    await waitFor(() => {
      expect(result.current.initialLoaded).toBe(true);
    });

    mockGetDeviceStorageSummary.mockClear();
    mockGetOtherProjectsStorageInventory.mockClear();

    act(() => {
      result.current.toggleResourceSelected('resource-b');
    });

    act(() => {
      result.current.requestDeleteSelected();
    });

    await waitFor(() => {
      expect(mockDeleteSelectedDownloadResources).toHaveBeenCalledWith(
        [groupsFixture[0].resources[0]],
        1,
      );
    });

    await waitFor(() => {
      expect(result.current.deleting).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);
    });

    expect(mockGetDeviceStorageSummary).toHaveBeenCalled();
    expect(mockGetOtherProjectsStorageInventory).toHaveBeenCalledWith(1);
  });

  it('reloads inventory when inventoryRefreshSignal changes after mount', async () => {
    const { rerender } = renderHook(
      ({ signal }: { signal: string }) =>
        usePrepareOfflineStorageManagement(1, signal),
      { initialProps: { signal: '0' } },
    );

    await waitFor(() => {
      expect(mockGetDeviceStorageSummary).toHaveBeenCalledTimes(1);
    });

    mockGetDeviceStorageSummary.mockClear();
    mockGetOtherProjectsStorageInventory.mockClear();

    rerender({ signal: '1' });

    await waitFor(() => {
      expect(mockGetDeviceStorageSummary).toHaveBeenCalledTimes(1);
      expect(mockGetOtherProjectsStorageInventory).toHaveBeenCalledWith(1);
    });
  });

  it('drops stale selected ids after inventory reload', async () => {
    const { result } = renderHook(() => usePrepareOfflineStorageManagement(1));

    await waitFor(() => {
      expect(result.current.initialLoaded).toBe(true);
    });

    act(() => {
      result.current.toggleResourceSelected('resource-b');
    });

    mockGetOtherProjectsStorageInventory.mockResolvedValue([]);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.hasSelection).toBe(false);
  });

  it('ignores stale reload results when a newer reload finishes first', async () => {
    let resolveFirstSummary:
      | ((value: typeof summaryFixture) => void)
      | undefined;
    let resolveSecondSummary:
      | ((value: typeof summaryFixture) => void)
      | undefined;
    let firstInventoryCall = 0;

    mockGetDeviceStorageSummary
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFirstSummary = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSecondSummary = resolve;
          }),
      );

    mockGetOtherProjectsStorageInventory.mockImplementation(async () => {
      firstInventoryCall += 1;
      if (firstInventoryCall === 1) {
        return new Promise(() => undefined);
      }
      return [];
    });

    const { result } = renderHook(() => usePrepareOfflineStorageManagement(1));

    await act(async () => {
      const firstReload = result.current.reload();
      const secondReload = result.current.reload();

      resolveSecondSummary?.(summaryFixture);
      await secondReload;

      resolveFirstSummary?.({
        ...summaryFixture,
        fluentUsedBytes: 999,
      });
      await firstReload;
    });

    expect(result.current.summary.fluentUsedBytes).toBe(350);
    expect(result.current.groups).toEqual([]);
  });

  it('clears inventory and avoids unhandled rejection when reload fails', async () => {
    const { result } = renderHook(() => usePrepareOfflineStorageManagement(1));

    await waitFor(() => {
      expect(result.current.initialLoaded).toBe(true);
    });

    mockGetDeviceStorageSummary.mockRejectedValueOnce(
      new Error('disk stats unavailable'),
    );
    mockGetOtherProjectsStorageInventory.mockRejectedValueOnce(
      new Error('disk stats unavailable'),
    );

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.initialLoaded).toBe(true);
    expect(result.current.summary).toEqual({
      availableBytes: null,
      totalDeviceBytes: null,
      fluentUsedBytes: 0,
    });
    expect(result.current.groups).toEqual([]);
  });
});
