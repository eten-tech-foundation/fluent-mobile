import * as FileSystem from 'expo-file-system/legacy';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import type { PendingUploadChapter } from '../db/queries';
import {
  getPendingRecordings,
  markRecordingFailed,
  markRecordingUploaded,
  setRecordingSyncStatus,
} from '../db/repository';
import type { PendingRecording } from '../types/db/types';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import { isAuthError } from './authError';
import { authToken } from './authToken';
import {
  blobKeyFromVerseAudioResponse,
  outcomeFromVerseAudioFailure,
} from './verseAudioContract';
import {
  setChapterUploadWorker,
  type ChapterUploadWorker,
} from './uploadOrchestrator';

const log = logger.create('RecordingSync');

export const MAX_UPLOAD_ATTEMPTS = 3;

export interface UploadResult {
  uploaded: number;
  failed: number;
}

export type RecordingSyncOptions = {
  signal?: AbortSignal;
  /** When set, only upload latest pending recordings for this chapter. */
  chapter?: PendingUploadChapter;
  /** Injectable backoff (tests). Default: attempt * 500ms. */
  delay?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

let inFlight: Promise<UploadResult> | null = null;

function defaultDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Upload aborted');
    error.name = 'AbortError';
    throw error;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  const name = parts[parts.length - 1];
  return name && name.length > 0 ? name : 'recording.m4a';
}

function contentTypeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'audio/mp4';
}

async function assertLocalFileExists(localFilePath: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(localFilePath);
  if (!info.exists || info.isDirectory) {
    throw Object.assign(new Error(`Recording file missing: ${localFilePath}`), {
      terminal: true,
    });
  }
}

async function uploadOneRecording(
  recording: PendingRecording,
  options: {
    signal?: AbortSignal;
    delay: (ms: number) => Promise<void>;
    maxAttempts: number;
  },
): Promise<'uploaded' | 'failed'> {
  const { signal, delay, maxAttempts } = options;

  throwIfAborted(signal);

  if (
    recording.projectUnitId === null ||
    !Number.isFinite(recording.projectUnitId)
  ) {
    const message =
      'Missing projectUnitId for recording (no matching chapter assignment)';
    log.error(message, { recordingId: recording.id });
    await markRecordingFailed(recording.id, message);
    return 'failed';
  }

  if (!Number.isFinite(recording.bibleTextId) || recording.bibleTextId <= 0) {
    const message = 'Missing or invalid bibleTextId for recording';
    log.error(message, { recordingId: recording.id });
    await markRecordingFailed(recording.id, message);
    return 'failed';
  }

  await setRecordingSyncStatus(recording.id, 'uploading');

  let lastMessage = 'Upload failed';
  let didMarkUploaded = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);

    try {
      await assertLocalFileExists(recording.localFilePath);

      const durationSeconds =
        recording.durationMs !== null && Number.isFinite(recording.durationMs)
          ? recording.durationMs / 1000
          : undefined;

      const response = await FluentAPI.uploadVerseAudio({
        projectUnitId: recording.projectUnitId,
        bibleTextId: recording.bibleTextId,
        file: {
          uri: recording.localFilePath,
          name: fileNameFromPath(recording.localFilePath),
          type: contentTypeFromPath(recording.localFilePath),
        },
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      });

      const blobKey = blobKeyFromVerseAudioResponse(response);
      await markRecordingUploaded(recording.id, blobKey);
      didMarkUploaded = true;
      log.info('Recording uploaded', {
        recordingId: recording.id,
        blobKey,
      });
      // Abort after a successful put still counts as uploaded (server has bytes).
      throwIfAborted(signal);
      return 'uploaded';
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        if (!didMarkUploaded) {
          await setRecordingSyncStatus(recording.id, 'pending');
        }
        throwIfAborted(signal);
        throw error;
      }

      if (isAuthError(error)) {
        await setRecordingSyncStatus(recording.id, 'pending');
        log.error('Recording upload auth failure', {
          recordingId: recording.id,
          error: error.message,
        });
        throw error;
      }

      const terminalMissing =
        error instanceof Error &&
        (error as Error & { terminal?: boolean }).terminal === true;
      if (terminalMissing) {
        lastMessage = error.message;
        await markRecordingFailed(recording.id, lastMessage);
        return 'failed';
      }

      const outcome = outcomeFromVerseAudioFailure(error);
      lastMessage = outcome.message;

      if (!outcome.retryable || attempt === maxAttempts) {
        log.error('Recording upload failed', {
          recordingId: recording.id,
          attempt,
          message: lastMessage,
          retryable: outcome.retryable,
        });
        await markRecordingFailed(recording.id, lastMessage);
        return 'failed';
      }

      log.warn('Recording upload retrying', {
        recordingId: recording.id,
        attempt,
        maxAttempts,
        message: lastMessage,
      });
      await delay(attempt * 500);
      if (signal?.aborted) {
        await setRecordingSyncStatus(recording.id, 'pending');
        throwIfAborted(signal);
      }
    }
  }

  await markRecordingFailed(recording.id, lastMessage);
  return 'failed';
}

async function runUploadPass(
  token: string,
  options: RecordingSyncOptions = {},
): Promise<UploadResult> {
  // Fail fast if API base URL is missing (never use @env).
  getApiBaseUrl();
  authToken.set(token);

  const delay = options.delay ?? defaultDelay;
  const maxAttempts = options.maxAttempts ?? MAX_UPLOAD_ATTEMPTS;
  const pending = await getPendingRecordings(options.chapter);

  log.info('Starting recording upload pass', {
    count: pending.length,
    chapter: options.chapter ?? null,
  });

  let uploaded = 0;
  let failed = 0;

  for (const recording of pending) {
    throwIfAborted(options.signal);
    const result = await uploadOneRecording(recording, {
      signal: options.signal,
      delay,
      maxAttempts,
    });
    if (result === 'uploaded') {
      uploaded += 1;
    } else {
      failed += 1;
    }
  }

  log.info('Recording upload pass complete', { uploaded, failed });
  return { uploaded, failed };
}

/**
 * Upload latest pending recordings (optionally filtered to one chapter).
 * Single-flight: overlapping calls share the in-flight promise.
 */
export async function syncPendingRecordings(
  token: string,
  options: RecordingSyncOptions = {},
): Promise<UploadResult> {
  if (!token) {
    throw new Error('Auth token is required for recording upload');
  }

  if (inFlight) {
    log.warn('Recording upload already in progress; joining in-flight pass');
    return inFlight;
  }

  inFlight = runUploadPass(token, options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Chapter worker entry used by `uploadOrchestrator` (#150). */
export async function uploadChapterRecordings(
  chapter: PendingUploadChapter,
  signal: AbortSignal,
  token?: string,
): Promise<void> {
  const resolved = token ?? authToken.get();
  if (!resolved) {
    throw new Error('No auth token available for chapter upload');
  }
  await syncPendingRecordings(resolved, { chapter, signal });
}

export function createChapterUploadWorker(
  getToken: () => string | null = () => authToken.get(),
): ChapterUploadWorker {
  return {
    uploadChapter: async (chapter, signal) => {
      const token = getToken();
      if (!token) {
        throw new Error('No auth token available for chapter upload');
      }
      await syncPendingRecordings(token, { chapter, signal });
    },
  };
}

/** Register the real chapter upload worker with the #150 orchestrator. */
export function registerRecordingUploadWorker(): void {
  setChapterUploadWorker(createChapterUploadWorker());
}

/** Test-only: clear single-flight state between cases. */
export function __resetRecordingSyncForTests(): void {
  inFlight = null;
}
