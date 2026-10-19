import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getDownloadQueueSnapshot } from '../db/repository';
import { getTransferTransportSnapshot } from '../services/connectivity';
import { getSharedDownloadQueueWorker } from '../services/downloadQueueWorkerSingleton';
import { getUploadOverCellular } from '../services/userPreferences';
import { emitDownloadQueueChanged } from '../utils/downloadQueueEvents';
import { useDownloadQueue } from './useDownloadQueue';

const mockWorkerStart = jest.fn();
const mockWorkerResume = jest.fn();
const mockWorkerCancel = jest.fn();
const mockGetState = jest.fn();

jest.mock('../services/connectivity', () => ({
  getTransferTransportSnapshot: jest.fn(),
}));

jest.mock('../services/userPreferences', () => ({
  getUploadOverCellular: jest.fn(() => false),
}));

jest.mock('../db/repository', () => ({
  getDownloadQueueSnapshot: jest.fn(() =>
    Promise.resolve({
      items: [],
      completedCount: 0,
      totalCount: 0,
      aggregateProgress: 0,
    }),
  ),
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
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn(() => '1'),
  setPrepareOfflineDownloadStarted: jest.fn(),
}));

jest.mock('../services/downloadQueueWorkerSingleton', () => ({
  getSharedDownloadQueueWorker: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
  },
}));

const queuedItem = {
  id: 'tier-1-source-bible-text',
  tier: 1 as const,
  label: 'Text',
  progress: 0,
  status: 'queued' as const,
  projectId: 1,
};

describe('useDownloadQueue transport gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkerStart.mockResolvedValue(undefined);
    mockWorkerResume.mockResolvedValue(undefined);
    mockGetState.mockReturnValue('idle');
    mockWorkerCancel.mockResolvedValue(undefined);
    (getSharedDownloadQueueWorker as jest.Mock).mockReturnValue({
      getState: mockGetState,
      start: mockWorkerStart,
      resume: mockWorkerResume,
      pause: jest.fn(),
      cancel: mockWorkerCancel,
    });
    (getUploadOverCellular as jest.Mock).mockReturnValue(false);
    (getTransferTransportSnapshot as jest.Mock).mockResolvedValue({
      isLinkOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
  });

  it('skips start on cellular when the toggle is off', async () => {
    (getTransferTransportSnapshot as jest.Mock).mockResolvedValue({
      isLinkOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
    });

    const { result } = renderHook(() => useDownloadQueue());

    await act(async () => {
      const gate = await result.current.start([queuedItem]);
      expect(gate).toEqual({ ok: false, gate: 'waiting_wifi' });
    });

    expect(mockWorkerStart).not.toHaveBeenCalled();
  });

  it('skips start when the link is offline', async () => {
    (getTransferTransportSnapshot as jest.Mock).mockResolvedValue({
      isLinkOnline: false,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });

    const { result } = renderHook(() => useDownloadQueue());

    await act(async () => {
      const gate = await result.current.start([queuedItem]);
      expect(gate).toEqual({ ok: false, gate: 'offline' });
    });

    expect(mockWorkerStart).not.toHaveBeenCalled();
  });

  it('does not resume a paused worker on cellular when the toggle is off', async () => {
    mockGetState.mockReturnValue('paused');
    (getTransferTransportSnapshot as jest.Mock).mockResolvedValue({
      isLinkOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
    });

    const { result } = renderHook(() => useDownloadQueue());

    await act(async () => {
      const gate = await result.current.resume();
      expect(gate).toEqual({ ok: false, gate: 'waiting_wifi' });
    });

    expect(mockWorkerResume).not.toHaveBeenCalled();
    expect(mockWorkerStart).not.toHaveBeenCalled();
  });

  it('resumes a paused worker on Wi-Fi', async () => {
    mockGetState.mockReturnValue('paused');

    const { result } = renderHook(() => useDownloadQueue());

    await act(async () => {
      await result.current.resume();
    });

    expect(mockWorkerResume).toHaveBeenCalled();
  });

  it('starts on cellular when the toggle is on', async () => {
    (getUploadOverCellular as jest.Mock).mockReturnValue(true);
    (getTransferTransportSnapshot as jest.Mock).mockResolvedValue({
      isLinkOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
    });

    const { result } = renderHook(() => useDownloadQueue());

    await act(async () => {
      await result.current.start([queuedItem]);
    });

    expect(mockWorkerStart).toHaveBeenCalledWith([queuedItem]);
  });

  it('resumes queued items on cellular when the toggle is on', async () => {
    (getUploadOverCellular as jest.Mock).mockReturnValue(true);
    (getTransferTransportSnapshot as jest.Mock).mockResolvedValue({
      isLinkOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
    });

    const { result } = renderHook(() => useDownloadQueue());

    await act(async () => {
      await result.current.resume();
    });

    expect(mockWorkerStart).toHaveBeenCalled();
  });

  it('starts on ethernet without the cellular toggle', async () => {
    (getTransferTransportSnapshot as jest.Mock).mockResolvedValue({
      isLinkOnline: true,
      isWifi: false,
      isCellular: false,
      connectionType: 'ethernet',
    });

    const { result } = renderHook(() => useDownloadQueue());

    await act(async () => {
      await result.current.start([queuedItem]);
    });

    expect(mockWorkerStart).toHaveBeenCalledWith([queuedItem]);
  });
});

describe('useDownloadQueue idle discovery and active flags (#147)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkerStart.mockResolvedValue(undefined);
    mockWorkerResume.mockResolvedValue(undefined);
    mockWorkerCancel.mockResolvedValue(undefined);
    mockGetState.mockReturnValue('idle');
    (getSharedDownloadQueueWorker as jest.Mock).mockReturnValue({
      getState: mockGetState,
      start: mockWorkerStart,
      resume: mockWorkerResume,
      pause: jest.fn(),
      cancel: mockWorkerCancel,
    });
    (getDownloadQueueSnapshot as jest.Mock).mockResolvedValue({
      items: [],
      completedCount: 0,
      totalCount: 0,
      aggregateProgress: 0,
    });
  });

  it('treats cancelled-only snapshots as inactive', async () => {
    (getDownloadQueueSnapshot as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'cancelled-1',
          tier: 1,
          label: 'Text',
          progress: 0.2,
          status: 'cancelled',
          projectId: 1,
        },
      ],
      completedCount: 0,
      totalCount: 0,
      aggregateProgress: 0,
    });

    const { result } = renderHook(() => useDownloadQueue());

    await waitFor(() => {
      expect(result.current.hasDownloads).toBe(false);
    });
  });

  it('refreshes an idle mounted consumer when the queue changes externally', async () => {
    const { result } = renderHook(() => useDownloadQueue());

    await waitFor(() => {
      expect(result.current.hasDownloads).toBe(false);
    });

    (getDownloadQueueSnapshot as jest.Mock).mockResolvedValue({
      items: [queuedItem],
      completedCount: 0,
      totalCount: 1,
      aggregateProgress: 0,
    });

    await act(async () => {
      emitDownloadQueueChanged();
    });

    await waitFor(() => {
      expect(result.current.hasDownloads).toBe(true);
      expect(result.current.snapshot.items).toHaveLength(1);
    });
  });

  it('notifies both mounted consumers and cleans up on unmount', async () => {
    const first = renderHook(() => useDownloadQueue());
    const second = renderHook(() => useDownloadQueue());

    await waitFor(() => {
      expect(first.result.current.hasDownloads).toBe(false);
      expect(second.result.current.hasDownloads).toBe(false);
    });

    const callsAfterMount = (getDownloadQueueSnapshot as jest.Mock).mock.calls
      .length;

    second.unmount();

    (getDownloadQueueSnapshot as jest.Mock).mockResolvedValue({
      items: [queuedItem],
      completedCount: 0,
      totalCount: 1,
      aggregateProgress: 0,
    });

    await act(async () => {
      emitDownloadQueueChanged();
    });

    await waitFor(() => {
      expect(first.result.current.hasDownloads).toBe(true);
    });

    // Unmounted consumer must not keep refreshing.
    expect(
      (getDownloadQueueSnapshot as jest.Mock).mock.calls.length -
        callsAfterMount,
    ).toBe(1);
  });

  it('refreshes after cancel so resume can see the cleared queue', async () => {
    (getDownloadQueueSnapshot as jest.Mock)
      .mockResolvedValueOnce({
        items: [queuedItem],
        completedCount: 0,
        totalCount: 1,
        aggregateProgress: 0,
      })
      .mockResolvedValue({
        items: [],
        completedCount: 0,
        totalCount: 0,
        aggregateProgress: 0,
      });

    const { result } = renderHook(() => useDownloadQueue());

    await waitFor(() => {
      expect(result.current.hasDownloads).toBe(true);
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(mockWorkerCancel).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.hasDownloads).toBe(false);
    });
  });
});
