import { renderHook, act, waitFor } from '@testing-library/react-native';
import { usePrepareOfflineDownload } from './usePrepareOfflineDownload';
import { PrepareOfflineCatalog } from '../types/prepareOffline/types';

const mockStart = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
const mockCancel = jest.fn();
const mockRefresh = jest.fn();

let mockSnapshot = {
  items: [] as {
    id: string;
    tier: 1;
    label: string;
    progress: number;
    status: string;
    projectId: number;
  }[],
  completedCount: 0,
  totalCount: 0,
  aggregateProgress: 0,
};

let mockWorkerState: 'idle' | 'downloading' | 'paused' | 'cancelled' = 'idle';

jest.mock('./useDownloadQueue', () => ({
  useDownloadQueue: () => ({
    snapshot: mockSnapshot,
    workerSessionState: mockWorkerState,
    start: mockStart,
    pause: mockPause,
    resume: mockResume,
    cancel: mockCancel,
    refresh: mockRefresh,
  }),
}));

jest.mock('../services/prepareOfflineDownload', () => ({
  enqueuePrepareOfflineDownload: jest.fn(() =>
    Promise.resolve(['tier-1-source-bible-text']),
  ),
}));

jest.mock('../services/storage', () => ({
  setPrepareOfflineDownloadStarted: jest.fn(),
  getPrepareOfflineDownloadStarted: jest.fn(() => false),
}));

jest.mock('../db/repository', () => ({
  getResumableDownloadItems: jest.fn(() =>
    Promise.resolve([
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0,
        status: 'queued',
        projectId: 1,
      },
    ]),
  ),
  getDownloadedResourcesByProject: jest.fn(() => Promise.resolve([])),
  cancelProjectDownloadTransfers: jest.fn(() => Promise.resolve()),
}));

const catalog: PrepareOfflineCatalog = {
  items: [
    {
      id: 'tier-1-source-bible-text',
      tier: 1,
      kind: 'text',
      groupName: 'Source Bible',
      label: 'Text',
      bytes: 1024,
      status: 'selected',
    },
  ],
  groups: [],
};

describe('usePrepareOfflineDownload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSnapshot = {
      items: [],
      completedCount: 0,
      totalCount: 0,
      aggregateProgress: 0,
    };
    mockWorkerState = 'idle';
    mockStart.mockResolvedValue(undefined);
    mockPause.mockResolvedValue(undefined);
    mockResume.mockResolvedValue(undefined);
    mockCancel.mockResolvedValue(undefined);
    mockRefresh.mockResolvedValue(undefined);
  });

  it('starts in idle session', () => {
    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    expect(result.current.session).toBe('idle');
  });

  it('shows downloading session immediately when handleDownload starts', async () => {
    const { getResumableDownloadItems } = jest.requireMock('../db/repository');
    let resolveFirstFetch: ((items: unknown[]) => void) | undefined;

    getResumableDownloadItems.mockImplementation(() => {
      if (resolveFirstFetch) {
        return Promise.resolve([
          {
            id: 'tier-1-source-bible-text',
            tier: 1,
            label: 'Text',
            progress: 0,
            status: 'queued',
            projectId: 1,
          },
        ]);
      }

      return new Promise(resolve => {
        resolveFirstFetch = resolve;
      });
    });

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    let downloadPromise!: Promise<void>;
    act(() => {
      downloadPromise = result.current.handleDownload();
    });

    expect(result.current.session).toBe('downloading');
    expect(result.current.busy).toBe(false);

    await act(async () => {
      resolveFirstFetch?.([
        {
          id: 'tier-1-source-bible-text',
          tier: 1,
          label: 'Text',
          progress: 0,
          status: 'queued',
          projectId: 1,
        },
      ]);
      await downloadPromise;
    });
  });

  it('runs a cancel tapped during kickoff after enqueue finishes without starting the worker', async () => {
    const { getResumableDownloadItems } = jest.requireMock('../db/repository');
    let resolveFirstFetch: ((items: unknown[]) => void) | undefined;

    getResumableDownloadItems.mockImplementation(() => {
      if (resolveFirstFetch) {
        return Promise.resolve([
          {
            id: 'tier-1-source-bible-text',
            tier: 1,
            label: 'Text',
            progress: 0,
            status: 'queued',
            projectId: 1,
          },
        ]);
      }

      return new Promise(resolve => {
        resolveFirstFetch = resolve;
      });
    });

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    let downloadPromise!: Promise<void>;
    act(() => {
      downloadPromise = result.current.handleDownload();
    });

    expect(result.current.session).toBe('downloading');

    await act(async () => {
      await result.current.cancel();
    });

    await act(async () => {
      resolveFirstFetch?.([
        {
          id: 'tier-1-source-bible-text',
          tier: 1,
          label: 'Text',
          progress: 0,
          status: 'queued',
          projectId: 1,
        },
      ]);
      await downloadPromise;
    });

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalled();
  });

  it('runs a pause tapped during kickoff after enqueue finishes without starting the worker', async () => {
    const { getResumableDownloadItems } = jest.requireMock('../db/repository');
    let resolveFirstFetch: ((items: unknown[]) => void) | undefined;

    getResumableDownloadItems.mockImplementation(() => {
      if (resolveFirstFetch) {
        return Promise.resolve([
          {
            id: 'tier-1-source-bible-text',
            tier: 1,
            label: 'Text',
            progress: 0,
            status: 'queued',
            projectId: 1,
          },
        ]);
      }

      return new Promise(resolve => {
        resolveFirstFetch = resolve;
      });
    });

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    let downloadPromise!: Promise<void>;
    act(() => {
      downloadPromise = result.current.handleDownload();
    });

    expect(result.current.session).toBe('downloading');

    await act(async () => {
      await result.current.pause();
    });

    await act(async () => {
      resolveFirstFetch?.([
        {
          id: 'tier-1-source-bible-text',
          tier: 1,
          label: 'Text',
          progress: 0,
          status: 'queued',
          projectId: 1,
        },
      ]);
      await downloadPromise;
    });

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockPause).toHaveBeenCalled();
  });

  it('transitions to downloading after handleDownload', async () => {
    mockWorkerState = 'downloading';
    mockSnapshot.items = [
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0.1,
        status: 'queued',
        projectId: 1,
      },
    ];

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    await act(async () => {
      await result.current.handleDownload();
    });

    await waitFor(() => {
      expect(result.current.session).toBe('downloading');
    });
    expect(mockStart).toHaveBeenCalled();
  });

  it('transitions to paused when worker is paused', async () => {
    mockWorkerState = 'paused';
    mockSnapshot.items = [
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'paused',
        projectId: 1,
      },
    ];

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.session).toBe('paused');
    });
  });

  it('returns to idle after cancel without resetting forceIdle for queued rows', async () => {
    mockSnapshot.items = [
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'cancelled',
        projectId: 1,
      },
      {
        id: 'tier-1-source-bible-audio',
        tier: 1,
        label: 'Audio',
        progress: 0,
        status: 'queued',
        projectId: 1,
      },
    ];

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.session).toBe('idle');
    expect(mockCancel).toHaveBeenCalled();
    expect(
      jest.requireMock('../db/repository').cancelProjectDownloadTransfers,
    ).toHaveBeenCalledWith(1);
  });

  it('stays idle when worker is paused for a different project', () => {
    mockWorkerState = 'paused';
    mockSnapshot.items = [
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'paused',
        projectId: 99,
      },
    ];

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    expect(result.current.session).toBe('idle');
  });

  it('stays idle with queued rows when worker is idle (no fake pause controls)', () => {
    mockWorkerState = 'idle';
    mockSnapshot.items = [
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0,
        status: 'queued',
        projectId: 1,
      },
    ];

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    expect(result.current.session).toBe('idle');
  });

  it('sets busy while pause is in flight', async () => {
    let resolvePause: () => void = () => undefined;
    mockPause.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolvePause = resolve;
        }),
    );

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    act(() => {
      void result.current.pause();
    });

    await waitFor(() => {
      expect(result.current.busy).toBe(true);
    });

    await act(async () => {
      resolvePause();
    });

    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
  });

  it('ignores concurrent pause invocations while one is in flight', async () => {
    let resolvePause: () => void = () => undefined;
    mockPause.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolvePause = resolve;
        }),
    );

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    act(() => {
      void result.current.pause();
      void result.current.pause();
    });

    await waitFor(() => {
      expect(result.current.busy).toBe(true);
    });
    expect(mockPause).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePause();
    });

    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
  });

  it('transitions to complete when session started and all selected items finish', async () => {
    const { getDownloadedResourcesByProject } =
      jest.requireMock('../db/repository');

    getDownloadedResourcesByProject.mockResolvedValue([
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 1,
        status: 'completed',
        projectId: 1,
      },
    ]);

    const { result, rerender } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    await act(async () => {
      await result.current.handleDownload();
    });

    mockSnapshot.items = [];
    rerender(undefined);

    await waitFor(() => {
      expect(result.current.session).toBe('complete');
    });
    expect(result.current.inventoryRefreshSignal).toBe('1');
  });

  it('restores complete session on mount when download started and all items are on device', async () => {
    const { getDownloadedResourcesByProject } =
      jest.requireMock('../db/repository');
    const { getPrepareOfflineDownloadStarted } = jest.requireMock(
      '../services/storage',
    );

    getPrepareOfflineDownloadStarted.mockReturnValue(true);
    getDownloadedResourcesByProject.mockResolvedValue([
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 1,
        status: 'completed',
        projectId: 1,
      },
    ]);

    const completedCatalog: PrepareOfflineCatalog = {
      items: [{ ...catalog.items[0], status: 'completed' }],
      groups: [],
    };

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog: completedCatalog,
        selectedItems: completedCatalog.items,
        canDownload: false,
      }),
    );

    await waitFor(() => {
      expect(result.current.session).toBe('complete');
    });
  });

  it('keeps inventoryRefreshSignal stable while queue progress updates', async () => {
    const multiItemCatalog: PrepareOfflineCatalog = {
      items: [
        catalog.items[0],
        {
          id: 'tier-1-source-bible-audio',
          tier: 1,
          kind: 'audio',
          groupName: 'Source Bible',
          label: 'Audio',
          bytes: 2048,
          status: 'selected',
        },
      ],
      groups: [],
    };

    mockWorkerState = 'downloading';
    mockSnapshot = {
      items: [
        {
          id: 'tier-1-source-bible-text',
          tier: 1,
          label: 'Text',
          progress: 0.25,
          status: 'downloading',
          projectId: 1,
        },
        {
          id: 'tier-1-source-bible-audio',
          tier: 1,
          label: 'Audio',
          progress: 0,
          status: 'queued',
          projectId: 1,
        },
      ],
      completedCount: 0,
      totalCount: 2,
      aggregateProgress: 0.125,
    };

    const { result, rerender } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog: multiItemCatalog,
        selectedItems: multiItemCatalog.items,
        canDownload: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.session).toBe('downloading');
    });
    expect(result.current.inventoryRefreshSignal).toBe('0');

    mockSnapshot = {
      ...mockSnapshot,
      completedCount: 1,
      aggregateProgress: 0.5,
    };
    rerender(undefined);

    expect(result.current.session).toBe('downloading');
    expect(result.current.inventoryRefreshSignal).toBe('0');
  });

  it('uses full catalog size for download button label after cancel', async () => {
    mockSnapshot.items = [
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'cancelled',
        projectId: 1,
      },
    ];

    const { result } = renderHook(() =>
      usePrepareOfflineDownload({
        projectId: 1,
        userId: 42,
        catalog,
        selectedItems: catalog.items,
        canDownload: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.downloadButtonLabel).toBe('Download 1 KB');
    });
  });
});
