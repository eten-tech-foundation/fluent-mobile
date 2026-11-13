// Production wiring (#886): the session an online publish starts reuses that
// just-completed `/health` success; every other session probes.
import {
  startUploadOrchestrator,
  stopUploadOrchestrator,
  syncNowUploads,
} from './uploadOrchestrator';

type ConnectivityListener = (
  online: boolean,
  wifi: boolean,
  cellular?: boolean,
  type?: string,
) => void;
const mockListeners = new Set<ConnectivityListener>();
const mockSnapshot = jest.fn();
const mockRecent = jest.fn();
const mockPendingChapters = jest.fn();

jest.mock('../db/queries', () => ({
  getPendingUploadChapters: () => mockPendingChapters(),
  hasPendingChapterClaimsForUser: async () => false,
}));
jest.mock('../db/stageAdvanceQueueRepository', () => ({
  getPendingStageAdvances: async () => [],
}));
jest.mock('../db/repositories/heldRecordingsRepository', () => ({
  reconcileHeldRecordings: async () => ({ held: 0, released: 0 }),
}));
// Membership refresh is exercised in projectMembership.test.ts; here it must
// resolve so the session reaches the transport probe under test (#848).
jest.mock('./projectMembership', () => ({
  refreshProjectMembership: async () => undefined,
}));
jest.mock('./connectivity', () => ({
  subscribeToConnectivity: (listener: ConnectivityListener) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
  getConnectivitySnapshot: () => mockSnapshot(),
  getRecentOnlineReachability: () => mockRecent(),
}));
jest.mock('./userPreferences', () => ({
  getUploadOverCellular: () => false,
  subscribeToPreference: () => () => undefined,
}));
jest.mock('./storage', () => ({
  getActiveUserId: () => '10',
  getSyncPausedUntilMs: () => null,
  setSyncPausedUntilMs: jest.fn(),
  setReauthRequired: jest.fn(),
}));
jest.mock('./sync', () => ({
  syncPendingChapterClaimsForUser: jest.fn(),
  syncPendingStageAdvancesForUser: jest.fn(),
}));
jest.mock('./keychain', () => ({ getCredentials: jest.fn() }));
jest.mock('./syncEvents', () => ({
  emitUploadSessionEvent: jest.fn(),
  emitAuthReauthRequired: jest.fn(),
  onSyncComplete: jest.fn(),
}));
jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

const online = {
  isOnline: true,
  isWifi: true,
  isCellular: false,
  connectionType: 'wifi',
};

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const publishOnline = async () => {
  for (const listener of [...mockListeners]) {
    listener(true, true, false, 'wifi');
  }
  await flush();
  await flush();
};

describe('upload session transport snapshot', () => {
  beforeEach(() => {
    mockListeners.clear();
    mockSnapshot.mockReset().mockResolvedValue(online);
    mockRecent.mockReset().mockReturnValue(null);
    mockPendingChapters
      .mockReset()
      .mockResolvedValue([{ bookId: 1, chapterNumber: 1 }]);
    startUploadOrchestrator({
      worker: { uploadChapter: jest.fn() },
      schedule: () => () => undefined,
    });
  });

  afterEach(() => {
    stopUploadOrchestrator();
  });

  it('reuses a recent success after an online publish without probing', async () => {
    mockRecent.mockReturnValue(online);
    await publishOnline();
    expect(mockRecent).toHaveBeenCalledTimes(1);
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it('probes when no recent success is cached (expired, failed, or link changed)', async () => {
    await publishOnline();
    expect(mockRecent).toHaveBeenCalledTimes(1);
    expect(mockSnapshot).toHaveBeenCalledTimes(1);
  });

  it('an automatic session with nothing queued neither probes nor reuses', async () => {
    mockPendingChapters.mockResolvedValue([]);
    await publishOnline();
    expect(mockRecent).not.toHaveBeenCalled();
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it('Sync Now always probes, even with a recent success cached', async () => {
    mockRecent.mockReturnValue(online);
    await syncNowUploads();
    expect(mockRecent).not.toHaveBeenCalled();
    expect(mockSnapshot).toHaveBeenCalledTimes(1);
  });
});
