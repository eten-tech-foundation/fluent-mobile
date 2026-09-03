import * as FileSystem from 'expo-file-system/legacy';
import { waitFor } from '@testing-library/react-native';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import type { PendingRecording } from '../types/db/types';
import { ApiError } from '../types/api/errors';
import type { VerseAudioResponse } from '../types/api/verseAudio';
import { AuthError } from './authError';
import { authToken } from './authToken';
import {
  __resetRecordingSyncForTests,
  createChapterUploadWorker,
  MAX_UPLOAD_ATTEMPTS,
  registerRecordingUploadWorker,
  syncPendingRecordings,
  uploadChapterRecordings,
} from './recordingSync';

const mockGetPendingRecordings = jest.fn();
const mockGetLatestVersionToken = jest.fn();
const mockSetRecordingSyncStatus = jest.fn();
const mockMarkRecordingUploaded = jest.fn();
const mockMarkRecordingConflicted = jest.fn();
const mockMarkRecordingAndChapterConflicted = jest.fn();
const mockMarkChapterHasConflictForVerse = jest.fn();
const mockMarkRecordingFailed = jest.fn();
const mockUpdateRecordingVersionToken = jest.fn();
const mockUploadVerseAudio = jest.fn();
const mockSetChapterUploadWorker = jest.fn();
const mockGetCredentials = jest.fn();
const mockGetActiveUserId = jest.fn();
const mockSetReauthRequired = jest.fn();
const mockEmitAuthReauthRequired = jest.fn();
const mockEmitUploadSessionEvent = jest.fn();

jest.mock('../db/repository', () => ({
  getPendingRecordings: (...args: unknown[]) =>
    mockGetPendingRecordings(...args),
  getLatestVersionToken: (...args: unknown[]) =>
    mockGetLatestVersionToken(...args),
  setRecordingSyncStatus: (...args: unknown[]) =>
    mockSetRecordingSyncStatus(...args),
  markRecordingUploaded: (...args: unknown[]) =>
    mockMarkRecordingUploaded(...args),
  markRecordingConflicted: (...args: unknown[]) =>
    mockMarkRecordingConflicted(...args),
  markRecordingAndChapterConflicted: (...args: unknown[]) =>
    mockMarkRecordingAndChapterConflicted(...args),
  markChapterHasConflictForVerse: (...args: unknown[]) =>
    mockMarkChapterHasConflictForVerse(...args),
  markRecordingFailed: (...args: unknown[]) => mockMarkRecordingFailed(...args),
  updateRecordingVersionToken: (...args: unknown[]) =>
    mockUpdateRecordingVersionToken(...args),
}));

jest.mock('./api', () => ({
  FluentAPI: {
    uploadVerseAudio: (...args: unknown[]) => mockUploadVerseAudio(...args),
  },
}));

jest.mock('./uploadOrchestrator', () => ({
  setChapterUploadWorker: (...args: unknown[]) =>
    mockSetChapterUploadWorker(...args),
}));

jest.mock('./keychain', () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
}));

jest.mock('./storage', () => ({
  getActiveUserId: (...args: unknown[]) => mockGetActiveUserId(...args),
  setReauthRequired: (...args: unknown[]) => mockSetReauthRequired(...args),
}));

jest.mock('./syncEvents', () => ({
  emitUploadSessionEvent: (...args: unknown[]) =>
    mockEmitUploadSessionEvent(...args),
  emitAuthReauthRequired: (...args: unknown[]) =>
    mockEmitAuthReauthRequired(...args),
}));

const FILE_URI = 'file:///mock-document/recordings/verse-1.m4a';

function pendingRecording(
  overrides: Partial<PendingRecording> = {},
): PendingRecording {
  return {
    id: 'rec-1',
    bibleTextId: 42,
    localFilePath: FILE_URI,
    durationMs: 1500,
    bookId: 40,
    chapterNumber: 1,
    projectUnitId: 12,
    recordedByUserId: null,
    ...overrides,
  };
}

function successResponse(
  overrides: Partial<VerseAudioResponse> = {},
): VerseAudioResponse {
  return {
    id: 9,
    projectUnitId: 12,
    bibleTextId: 42,
    uploadedBy: 1,
    contentType: 'audio/mp4',
    sizeBytes: 100,
    durationSeconds: 1.5,
    versionToken: 2,
    conflictStatus: 'clean',
    activeTakeId: 9,
    takes: [],
    verseNumber: 1,
    downloadUrl: 'https://example.test/a',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('recordingSync', () => {
  const delay = jest.fn(async () => undefined);

  beforeEach(async () => {
    jest.clearAllMocks();
    __resetRecordingSyncForTests();
    resetFileSystemMock();
    authToken.set(null);
    await FileSystem.writeAsStringAsync(FILE_URI, 'fake-audio');
    mockGetPendingRecordings.mockResolvedValue([pendingRecording()]);
    mockGetLatestVersionToken.mockResolvedValue(undefined);
    mockSetRecordingSyncStatus.mockResolvedValue(undefined);
    mockMarkRecordingUploaded.mockResolvedValue(undefined);
    mockMarkRecordingConflicted.mockResolvedValue(undefined);
    mockMarkRecordingAndChapterConflicted.mockResolvedValue(undefined);
    mockMarkChapterHasConflictForVerse.mockResolvedValue(undefined);
    mockMarkRecordingFailed.mockResolvedValue(undefined);
    mockUploadVerseAudio.mockResolvedValue(successResponse());
    mockGetCredentials.mockResolvedValue(null);
    mockGetActiveUserId.mockReturnValue('2');
  });

  afterEach(() => {
    authToken.set(null);
  });

  it('uploads pending recordings via FluentAPI and marks uploaded with blob_key', async () => {
    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 1, conflicted: 0, failed: 0 });
    expect(mockGetLatestVersionToken).toHaveBeenCalledWith(42);
    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        projectUnitId: 12,
        bibleTextId: 42,
      }),
      'tok-1',
    );
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
      2,
    );
    expect(mockMarkRecordingConflicted).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
  });

  it('sends baseVersionToken when a prior token exists locally', async () => {
    mockGetLatestVersionToken.mockResolvedValue(3);

    await syncPendingRecordings('tok-1', { delay });

    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.objectContaining({ baseVersionToken: 3 }),
      'tok-1',
    );
  });

  it('marks conflicted when server returns conflictStatus conflict', async () => {
    mockUploadVerseAudio.mockResolvedValue(
      successResponse({ conflictStatus: 'conflict', versionToken: 4 }),
    );

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 0, conflicted: 1, failed: 0 });
    expect(mockMarkRecordingAndChapterConflicted).toHaveBeenCalledWith(
      'rec-1',
      42,
      4,
    );
    expect(mockMarkRecordingUploaded).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
  });

  it('uploads with the recording owner token when credentials exist (#105)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ recordedByUserId: 7 }),
    ]);
    mockGetCredentials.mockResolvedValue({ token: 'owner-tok' });

    await syncPendingRecordings('active-tok', { delay });

    expect(mockGetCredentials).toHaveBeenCalledWith('7');
    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.any(Object),
      'owner-tok',
    );
  });

  it('falls back to the pass token when owner credentials are missing', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ recordedByUserId: 9 }),
    ]);
    mockGetCredentials.mockResolvedValue(null);

    await syncPendingRecordings('pass-tok', { delay });

    expect(mockGetCredentials).toHaveBeenCalledWith('9');
    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.any(Object),
      'pass-tok',
    );
  });

  it('filters by chapter when provided (orchestrator batching)', async () => {
    await syncPendingRecordings('tok-1', {
      chapter: { bookId: 40, chapterNumber: 3 },
      delay,
    });

    expect(mockGetPendingRecordings).toHaveBeenCalledWith({
      bookId: 40,
      chapterNumber: 3,
    });
  });

  it('marks terminal client failures without retry', async () => {
    mockUploadVerseAudio.mockRejectedValue(new ApiError(400, 'bad request'));

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 0, conflicted: 0, failed: 1 });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      'bad request',
    );
  });

  it('treats 503 storage-unconfigured as terminal failure', async () => {
    mockUploadVerseAudio.mockRejectedValue(
      new ApiError(503, 'Storage not configured: missing connection'),
    );

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 0, conflicted: 0, failed: 1 });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      'Storage not configured: missing connection',
    );
  });

  it('retries 409 compare-and-swap races then succeeds', async () => {
    mockUploadVerseAudio
      .mockRejectedValueOnce(new ApiError(409, 'concurrent write'))
      .mockResolvedValueOnce(successResponse());

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 1, conflicted: 0, failed: 0 });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(500);
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
      2,
    );
  });

  it('saves currentVersionToken from 409 before retry', async () => {
    mockUploadVerseAudio
      .mockRejectedValueOnce(
        new ApiError(409, 'Conflict', undefined, { currentVersionToken: 8 }),
      )
      .mockResolvedValueOnce(successResponse());

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 1, conflicted: 0, failed: 0 });
    expect(mockUpdateRecordingVersionToken).toHaveBeenCalledWith('rec-1', 8);
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(500);
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
      2,
    );
  });

  it('does not save when 409 lacks currentVersionToken', async () => {
    mockUploadVerseAudio
      .mockRejectedValueOnce(new ApiError(409, 'Conflict', undefined, {}))
      .mockResolvedValueOnce(successResponse());

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 1, conflicted: 0, failed: 0 });
    expect(mockUpdateRecordingVersionToken).not.toHaveBeenCalled();
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(2);
  });

  it('retries retryable failures with backoff then succeeds', async () => {
    mockUploadVerseAudio
      .mockRejectedValueOnce(new ApiError(0, 'network down'))
      .mockRejectedValueOnce(new ApiError(502, 'bad gateway'))
      .mockResolvedValueOnce(successResponse());

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 1, conflicted: 0, failed: 0 });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenNthCalledWith(1, 500);
    expect(delay).toHaveBeenNthCalledWith(2, 1000);
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
      2,
    );
  });

  it('marks failed after exhausting retryable attempts', async () => {
    mockUploadVerseAudio.mockRejectedValue(new ApiError(500, 'server boom'));

    const result = await syncPendingRecordings('tok-1', {
      delay,
      maxAttempts: MAX_UPLOAD_ATTEMPTS,
    });

    expect(result).toEqual({ uploaded: 0, conflicted: 0, failed: 1 });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(MAX_UPLOAD_ATTEMPTS);
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      'server boom',
    );
  });

  it('marks missing local file as terminal failure', async () => {
    await FileSystem.deleteAsync(FILE_URI);

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 0, conflicted: 0, failed: 1 });
    expect(mockUploadVerseAudio).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      expect.stringContaining('Recording file missing'),
    );
  });

  it('marks missing projectUnitId as terminal failure', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ projectUnitId: null }),
    ]);

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 0, conflicted: 0, failed: 1 });
    expect(mockUploadVerseAudio).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      expect.stringContaining('Missing projectUnitId'),
    );
  });

  it('resets status and rethrows AuthError without marking failed', async () => {
    mockUploadVerseAudio.mockRejectedValue(new AuthError('session expired'));

    await expect(
      syncPendingRecordings('tok-1', { delay }),
    ).rejects.toBeInstanceOf(AuthError);

    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
    expect(mockSetRecordingSyncStatus).toHaveBeenCalledWith('rec-1', 'pending');
    expect(mockSetReauthRequired).toHaveBeenCalledWith('2');
    expect(mockEmitAuthReauthRequired).toHaveBeenCalledWith('2');
  });

  it('marks the recording owner for reauth when owner token upload returns 401', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ recordedByUserId: 7 }),
    ]);
    mockGetCredentials.mockResolvedValue({ token: 'owner-tok' });
    mockGetActiveUserId.mockReturnValue('2');
    mockUploadVerseAudio.mockRejectedValue(new AuthError('session expired'));

    await expect(
      syncPendingRecordings('active-tok', { delay }),
    ).rejects.toBeInstanceOf(AuthError);

    expect(mockSetReauthRequired).toHaveBeenCalledWith('7');
    expect(mockEmitAuthReauthRequired).not.toHaveBeenCalled();
    expect(mockSetRecordingSyncStatus).toHaveBeenCalledWith('rec-1', 'pending');
  });

  it('honors abort signal between recordings and leaves status pending', async () => {
    const controller = new AbortController();
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'rec-1' }),
      pendingRecording({ id: 'rec-2', bibleTextId: 43 }),
    ]);
    mockUploadVerseAudio.mockImplementation(async () => {
      controller.abort();
      return successResponse();
    });

    await expect(
      syncPendingRecordings('tok-1', { delay, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
      2,
    );
    expect(mockSetRecordingSyncStatus).not.toHaveBeenCalledWith(
      'rec-2',
      'uploading',
    );
  });

  it('aborts during retry backoff without marking failed', async () => {
    const controller = new AbortController();
    mockUploadVerseAudio.mockRejectedValue(new ApiError(0, 'network'));
    const abortingDelay = jest.fn(async () => {
      controller.abort();
    });

    await expect(
      syncPendingRecordings('tok-1', {
        delay: abortingDelay,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
    expect(mockSetRecordingSyncStatus).toHaveBeenCalledWith('rec-1', 'pending');
  });

  it('enforces single-flight across overlapping syncPendingRecordings calls', async () => {
    let resolveUpload: (value: unknown) => void = () => undefined;
    mockUploadVerseAudio.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpload = resolve;
        }),
    );

    const first = syncPendingRecordings('tok-1', { delay });
    // Let the first pass reach FluentAPI before starting the second call.
    await waitFor(() => {
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    });
    const second = syncPendingRecordings('tok-2', { delay });

    resolveUpload(successResponse());
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ uploaded: 1, conflicted: 0, failed: 0 });
    expect(b).toEqual({ uploaded: 1, conflicted: 0, failed: 0 });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
  });

  it('requires a non-empty auth token', async () => {
    await expect(syncPendingRecordings('', { delay })).rejects.toThrow(
      /Auth token is required/,
    );
  });

  it('uploadChapterRecordings uses chapter filter and session token', async () => {
    authToken.set('session-tok');
    const controller = new AbortController();

    await uploadChapterRecordings(
      { bookId: 40, chapterNumber: 1 },
      controller.signal,
    );

    expect(mockGetPendingRecordings).toHaveBeenCalledWith({
      bookId: 40,
      chapterNumber: 1,
    });
    expect(mockMarkRecordingUploaded).toHaveBeenCalled();
  });

  it('createChapterUploadWorker registers chapter uploads', async () => {
    const worker = createChapterUploadWorker(() => 'worker-tok');
    const controller = new AbortController();

    await worker.uploadChapter(
      { bookId: 40, chapterNumber: 2 },
      controller.signal,
    );

    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.any(Object),
      'worker-tok',
    );
    expect(mockGetPendingRecordings).toHaveBeenCalledWith({
      bookId: 40,
      chapterNumber: 2,
    });
  });

  it('registerRecordingUploadWorker wires setChapterUploadWorker', () => {
    registerRecordingUploadWorker();
    expect(mockSetChapterUploadWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadChapter: expect.any(Function),
      }),
    );
  });

  it('does not invent R2 /recordings/sync paths', async () => {
    await syncPendingRecordings('tok-1', { delay });
    const call = mockUploadVerseAudio.mock.calls[0][0];
    expect(JSON.stringify(call)).not.toMatch(/recordings\/sync/);
    expect(JSON.stringify(call)).not.toMatch(/R2_/);
  });
});
