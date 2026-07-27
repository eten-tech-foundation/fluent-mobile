import * as FileSystem from 'expo-file-system/legacy';
import { waitFor } from '@testing-library/react-native';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import type { PendingRecording } from '../types/db/types';
import { ApiError } from '../types/api/errors';
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
const mockSetRecordingSyncStatus = jest.fn();
const mockMarkRecordingUploaded = jest.fn();
const mockMarkRecordingFailed = jest.fn();
const mockUploadVerseAudio = jest.fn();
const mockSetChapterUploadWorker = jest.fn();
const mockGetCredentials = jest.fn();

jest.mock('../db/repository', () => ({
  getPendingRecordings: (...args: unknown[]) =>
    mockGetPendingRecordings(...args),
  setRecordingSyncStatus: (...args: unknown[]) =>
    mockSetRecordingSyncStatus(...args),
  markRecordingUploaded: (...args: unknown[]) =>
    mockMarkRecordingUploaded(...args),
  markRecordingFailed: (...args: unknown[]) => mockMarkRecordingFailed(...args),
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

function successResponse() {
  return {
    id: 9,
    projectUnitId: 12,
    bibleTextId: 42,
    uploadedBy: 1,
    contentType: 'audio/mp4',
    sizeBytes: 100,
    durationSeconds: 1.5,
    verseNumber: 1,
    downloadUrl: 'https://example.test/a',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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
    mockSetRecordingSyncStatus.mockResolvedValue(undefined);
    mockMarkRecordingUploaded.mockResolvedValue(undefined);
    mockMarkRecordingFailed.mockResolvedValue(undefined);
    mockUploadVerseAudio.mockResolvedValue(successResponse());
    mockGetCredentials.mockResolvedValue(null);
  });

  afterEach(() => {
    authToken.set(null);
  });

  it('uploads pending recordings via FluentAPI and marks uploaded with blob_key', async () => {
    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 1, failed: 0 });
    expect(authToken.get()).toBe('tok-1');
    expect(mockSetRecordingSyncStatus).toHaveBeenCalledWith(
      'rec-1',
      'uploading',
    );
    expect(mockUploadVerseAudio).toHaveBeenCalledWith({
      projectUnitId: 12,
      bibleTextId: 42,
      file: {
        uri: FILE_URI,
        name: 'verse-1.m4a',
        type: 'audio/mp4',
      },
      durationSeconds: 1.5,
    });
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
    );
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
  });

  it('uploads with the recording owner token when credentials exist (#105)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ recordedByUserId: 7 }),
    ]);
    mockGetCredentials.mockResolvedValue({ token: 'owner-tok' });

    await syncPendingRecordings('active-tok', { delay });

    expect(mockGetCredentials).toHaveBeenCalledWith('7');
    expect(authToken.get()).toBe('owner-tok');
    expect(mockUploadVerseAudio).toHaveBeenCalled();
  });

  it('falls back to the pass token when owner credentials are missing', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ recordedByUserId: 9 }),
    ]);
    mockGetCredentials.mockResolvedValue(null);

    await syncPendingRecordings('pass-tok', { delay });

    expect(mockGetCredentials).toHaveBeenCalledWith('9');
    expect(authToken.get()).toBe('pass-tok');
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

    expect(result).toEqual({ uploaded: 0, failed: 1 });
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

    expect(result).toEqual({ uploaded: 0, failed: 1 });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      'Storage not configured: missing connection',
    );
  });

  it('retries retryable failures with backoff then succeeds', async () => {
    mockUploadVerseAudio
      .mockRejectedValueOnce(new ApiError(0, 'network down'))
      .mockRejectedValueOnce(new ApiError(502, 'bad gateway'))
      .mockResolvedValueOnce(successResponse());

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 1, failed: 0 });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenNthCalledWith(1, 500);
    expect(delay).toHaveBeenNthCalledWith(2, 1000);
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
    );
  });

  it('marks failed after exhausting retryable attempts', async () => {
    mockUploadVerseAudio.mockRejectedValue(new ApiError(500, 'server boom'));

    const result = await syncPendingRecordings('tok-1', {
      delay,
      maxAttempts: MAX_UPLOAD_ATTEMPTS,
    });

    expect(result).toEqual({ uploaded: 0, failed: 1 });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(MAX_UPLOAD_ATTEMPTS);
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      'server boom',
    );
  });

  it('marks missing local file as terminal failure', async () => {
    await FileSystem.deleteAsync(FILE_URI);

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({ uploaded: 0, failed: 1 });
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

    expect(result).toEqual({ uploaded: 0, failed: 1 });
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
    expect(a).toEqual({ uploaded: 1, failed: 0 });
    expect(b).toEqual({ uploaded: 1, failed: 0 });
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

    expect(authToken.get()).toBe('worker-tok');
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
