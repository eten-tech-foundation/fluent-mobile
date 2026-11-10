import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createUploadOrchestrator } from './uploadOrchestratorCore';
import type { TakeProgressListener } from './uploadOrchestratorCore';
import { emitUploadSessionEvent } from './syncEvents';
import { getSyncStatusSnapshot } from './syncStatusStore';
import { usePendingUploads } from '../hooks/usePendingUploads';
import { useUploadSessionState } from '../hooks/useUploadSessionState';

let mockPendingCount = 2;
let mockOrchestrator: ReturnType<typeof createUploadOrchestrator>;

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('../utils/parseUserId', () => ({ parseUserId: jest.fn(() => 7) }));
jest.mock('../db/queries', () => ({
  getDatabaseWriteMark: jest.fn(() => Promise.resolve(null)),
  sameDatabaseWrites: jest.fn(() => false),
  getPendingUploadCount: async () => mockPendingCount,
  getPendingUploadChapters: async () =>
    mockPendingCount ? [{ bookId: 1, chapterNumber: 1 }] : [],
  getFailedUploadCount: async () => 0,
  getFailedUploadErrorSummary: async () => null,
  getUnuploadablePendingSummary: async () => ({ total: 0 }),
}));
jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));
jest.mock('./uploadOrchestrator', () => ({
  getUploadSessionSnapshot: () => mockOrchestrator.getSnapshot(),
  pauseUploadSession: jest.fn(),
  cancelUploadSession: jest.fn(),
  syncNowUploads: jest.fn(),
}));

it('updates a late subscriber after the real orchestrator reports 1/2', async () => {
  let takeProgress: TakeProgressListener | undefined;
  let finishChapter: (() => void) | undefined;
  const events: unknown[] = [];
  mockOrchestrator = createUploadOrchestrator({
    subscribeToConnectivity: () => () => {},
    getUploadOverCellular: () => false,
    subscribeToUploadOverCellular: () => () => {},
    getPendingUploadChapters: async () =>
      mockPendingCount ? [{ bookId: 1, chapterNumber: 1 }] : [],
    getPausedUntilMs: () => null,
    setPausedUntilMs: () => {},
    now: Date.now,
    pauseWindowMs: 60_000,
    worker: {
      uploadChapter: async (_chapter, _signal, onTakeProgress) => {
        takeProgress = onTakeProgress;
        await new Promise<void>(resolve => {
          finishChapter = resolve;
        });
      },
    },
    emit: event => {
      events.push(event);
      emitUploadSessionEvent(event);
    },
    getSessionTransportSnapshot: async () => ({
      isOnline: true,
      isWifi: true,
      connectionType: 'wifi',
    }),
    pushPendingClaimsBeforeUpload: async () => {},
    pushPendingStageAdvancesAfterUpload: async () => {},
    hasPendingStageAdvances: async () => false,
    hasPendingClaims: async () => false,
  });
  mockOrchestrator.start();
  const session = mockOrchestrator.syncNow();
  await waitFor(() => expect(takeProgress).toBeDefined());
  expect(events[0]).toEqual({ type: 'start', totalChapters: 1 });
  // The store has not subscribed yet, so it missed the session start.
  expect(getSyncStatusSnapshot().uploadProgress).toBeNull();
  const { result, unmount } = renderHook(() => {
    const pending = usePendingUploads();
    const upload = useUploadSessionState({
      hasPendingUploads: pending.hasPendingUploads,
      hasFailedUploads: pending.hasFailedUploads,
      uploadProgress: pending.uploadProgress,
    });
    return { pending, upload };
  });
  await waitFor(() => expect(result.current.pending.pendingCount).toBe(2));
  await act(async () => {
    takeProgress?.({ completedTakes: 0, failedTakes: 0, totalTakes: 2 });
  });
  expect(result.current.upload.progressCurrentChapter?.completedTakes).toBe(0);
  await act(async () => {
    mockPendingCount = 1;
    takeProgress?.({ completedTakes: 1, failedTakes: 0, totalTakes: 2 });
  });
  await waitFor(() => expect(result.current.pending.pendingCount).toBe(1));
  expect(mockOrchestrator.getSnapshot().currentChapter?.completedTakes).toBe(1);
  // The shared store and visible hook must retain per-take progress.
  expect(
    getSyncStatusSnapshot().uploadProgress?.currentChapter?.completedTakes,
  ).toBe(1);
  expect(result.current.upload.progressCurrentChapter?.completedTakes).toBe(1);
  unmount();
  mockPendingCount = 0;
  finishChapter?.();
  await session;
  mockOrchestrator.stop();
});
