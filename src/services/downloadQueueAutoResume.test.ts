import { startDownloadQueueAutoResume } from './downloadQueueAutoResume';
import { getSharedDownloadQueueWorker } from './downloadQueueWorkerSingleton';

const mockSubscribe = jest.fn();
const mockGetResumable = jest.fn();
const mockWorkerStart = jest.fn();
const mockGetState = jest.fn();

jest.mock('./connectivity', () => ({
  subscribeToConnectivity: (...args: unknown[]) => mockSubscribe(...args),
}));

jest.mock('../db/repository', () => ({
  getResumableDownloadItems: (...args: unknown[]) => mockGetResumable(...args),
}));

jest.mock('./downloadQueueWorkerSingleton', () => ({
  getSharedDownloadQueueWorker: jest.fn(),
}));

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
  });

  it('does not resume when not on Wi-Fi', async () => {
    startDownloadQueueAutoResume();
    const listener = mockSubscribe.mock.calls[0][0];

    await listener(false, false, false);

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

    startDownloadQueueAutoResume();
    const listener = mockSubscribe.mock.calls[0][0];

    await listener(true, true, false);

    await Promise.resolve();

    expect(mockGetResumable).toHaveBeenCalledWith(true);
    expect(mockWorkerStart).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'cancelled' }),
    ]);
  });

  it('skips auto-resume while worker is actively downloading', async () => {
    mockGetState.mockReturnValue('downloading');

    startDownloadQueueAutoResume();
    const listener = mockSubscribe.mock.calls[0][0];

    await listener(true, true, false);
    await Promise.resolve();

    expect(mockGetResumable).not.toHaveBeenCalled();
    expect(mockWorkerStart).not.toHaveBeenCalled();
  });
});
