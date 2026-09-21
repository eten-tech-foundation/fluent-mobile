import { startDownloadQueueAutoResume } from './downloadQueueAutoResume';
import { getTransferTransportSnapshot } from './connectivity';
import { getSharedDownloadQueueWorker } from './downloadQueueWorkerSingleton';
import {
  getUploadOverCellular,
  subscribeToPreference,
} from './userPreferences';

const mockSubscribe = jest.fn();
const mockGetResumable = jest.fn();
const mockWorkerStart = jest.fn();
const mockGetState = jest.fn();

jest.mock('./userPreferences', () => ({
  getUploadOverCellular: jest.fn(() => false),
  subscribeToPreference: jest.fn(() => jest.fn()),
}));

jest.mock('./connectivity', () => ({
  subscribeToConnectivity: (...args: unknown[]) => mockSubscribe(...args),
  getTransferTransportSnapshot: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  getResumableDownloadItems: (...args: unknown[]) => mockGetResumable(...args),
}));

jest.mock('./downloadQueueWorkerSingleton', () => ({
  getSharedDownloadQueueWorker: jest.fn(),
}));

const mockGetTransferTransportSnapshot =
  getTransferTransportSnapshot as jest.MockedFunction<
    typeof getTransferTransportSnapshot
  >;

function mockTransport(
  snapshot: Awaited<ReturnType<typeof getTransferTransportSnapshot>>,
) {
  mockGetTransferTransportSnapshot.mockResolvedValue(snapshot);
}

describe('downloadQueueAutoResume', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue(jest.fn());
    mockGetResumable.mockResolvedValue([]);
    mockWorkerStart.mockResolvedValue(undefined);
    mockGetState.mockReturnValue('idle');
    (getSharedDownloadQueueWorker as jest.Mock).mockReturnValue({
      getState: mockGetState,
      start: mockWorkerStart,
    });
    (getUploadOverCellular as jest.Mock).mockReturnValue(false);
    mockTransport({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
  });

  const fireConnectivity = async () => {
    startDownloadQueueAutoResume();
    const listener = mockSubscribe.mock.calls[0][0] as () => void;
    listener();
    await Promise.resolve();
    await Promise.resolve();
  };

  it('does not resume when the link is offline', async () => {
    mockTransport({
      isOnline: false,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });

    await fireConnectivity();

    expect(mockGetResumable).not.toHaveBeenCalled();
    expect(mockWorkerStart).not.toHaveBeenCalled();
  });

  it('does not resume on cellular when uploadOverCellular is false', async () => {
    mockTransport({
      isOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
    });

    await fireConnectivity();

    expect(mockGetResumable).not.toHaveBeenCalled();
    expect(mockWorkerStart).not.toHaveBeenCalled();
  });

  it('resumes cancelled queue items on Wi-Fi', async () => {
    mockGetResumable.mockResolvedValue([
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'cancelled',
        projectId: 1,
      },
    ]);

    await fireConnectivity();

    expect(mockGetResumable).toHaveBeenCalledWith(true);
    expect(mockWorkerStart).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'cancelled' }),
    ]);
  });

  it('resumes on cellular when uploadOverCellular is enabled', async () => {
    (getUploadOverCellular as jest.Mock).mockReturnValue(true);
    mockTransport({
      isOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
    });
    mockGetResumable.mockResolvedValue([
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'cancelled',
        projectId: 1,
      },
    ]);

    await fireConnectivity();

    expect(mockGetResumable).toHaveBeenCalledWith(true);
    expect(mockWorkerStart).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'cancelled' }),
    ]);
  });

  it('re-evaluates when uploadOverCellular preference changes', async () => {
    let prefListener: (() => void) | undefined;
    (subscribeToPreference as jest.Mock).mockImplementation(
      (_key: string, listener: () => void) => {
        prefListener = listener;
        return jest.fn();
      },
    );
    mockGetResumable.mockResolvedValue([
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'cancelled',
        projectId: 1,
      },
    ]);

    startDownloadQueueAutoResume();
    mockTransport({
      isOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
    });
    (getUploadOverCellular as jest.Mock).mockReturnValue(true);

    prefListener?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGetResumable).toHaveBeenCalledWith(true);
    expect(mockWorkerStart).toHaveBeenCalled();
  });

  it('skips auto-resume while worker is actively downloading', async () => {
    mockGetState.mockReturnValue('downloading');

    await fireConnectivity();

    expect(mockGetResumable).not.toHaveBeenCalled();
    expect(mockWorkerStart).not.toHaveBeenCalled();
  });

  it('does not start worker after unsubscribe while resumable fetch is pending', async () => {
    let resolveResumable: (value: unknown[]) => void = () => undefined;
    mockGetResumable.mockImplementation(
      () =>
        new Promise<unknown[]>(resolve => {
          resolveResumable = resolve;
        }),
    );

    const stop = startDownloadQueueAutoResume();
    const listener = mockSubscribe.mock.calls[0][0] as () => void;

    listener();
    stop();

    resolveResumable([
      {
        id: 'tier-1-source-bible-text',
        tier: 1,
        label: 'Text',
        progress: 0.5,
        status: 'cancelled',
        projectId: 1,
      },
    ]);

    await Promise.resolve();
    await Promise.resolve();

    expect(mockWorkerStart).not.toHaveBeenCalled();
  });
});
