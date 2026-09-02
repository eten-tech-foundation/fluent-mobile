import * as FileSystem from 'expo-file-system/legacy';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import type { PendingUploadChapter } from '../db/queries';
import {
  getPendingRecordings,
  getLatestVersionToken,
  markRecordingAndChapterConflicted,
  markRecordingFailed,
  markRecordingUploaded,
  setRecordingSyncStatus,
} from '../db/repository';
import type { PendingRecording } from '../types/db/types';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import { isAuthError } from './authError';
import { authToken } from './authToken';
import { getCredentials } from './keychain';
import { getActiveUserId, setReauthRequired } from './storage';
import {
  blobKeyFromVerseAudioResponse,
  outcomeFromVerseAudioFailure,
} from './verseAudioContract';
import { emitAuthReauthRequired, emitUploadSessionEvent } from './syncEvents';
import {
  setChapterUploadWorker,
  type ChapterUploadWorker,
} from './uploadOrchestrator';

const log = logger.create('RecordingSync');

export const MAX_UPLOAD_ATTEMPTS = 3;

export interface UploadResult {
  uploaded: number;
  conflicted: number;
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

async function handleUploadAuthFailure(userId: string): Promise<void> {
  setReauthRequired(userId);
  if (userId === getActiveUserId()) {
    emitAuthReauthRequired(userId);
  }
}

export type UploadTokenResolution = {
  token: string;
  userId: string | null;
};

/**
 * Prefer the capture-time owner's stored token so upload attribution stays
 * stable even if another account is active (#105). Falls back to the pass token.
 */
export async function resolveUploadTokenForRecording(
  recording: PendingRecording,
  fallbackToken: string,
): Promise<UploadTokenResolution> {
  if (
    recording.recordedByUserId === null ||
    !Number.isFinite(recording.recordedByUserId)
  ) {
    return { token: fallbackToken, userId: getActiveUserId() || null };
  }
  const userId = String(recording.recordedByUserId);
  const creds = await getCredentials(userId);
  if (creds?.token) {
    return { token: creds.token, userId };
  }
  log.warn('Owner credentials missing; using active pass token', {
    recordingId: recording.id,
    recordedByUserId: recording.recordedByUserId,
  });
  return { token: fallbackToken, userId: getActiveUserId() || null };
}

async function uploadOneRecording(
  recording: PendingRecording,
  options: {
    signal?: AbortSignal;
    delay: (ms: number) => Promise<void>;
    maxAttempts: number;
    /** Token for this recording (owner preferred). */
    token: string;
    /** User id that owns the upload token (for auth failure handling). */
    tokenUserId: string | null;
  },
): Promise<'uploaded' | 'conflicted' | 'failed'> {
  const { signal, delay, maxAttempts, token, tokenUserId } = options;

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
  let didMarkConflicted = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);

    try {
      await assertLocalFileExists(recording.localFilePath);

      const durationSeconds =
        recording.durationMs !== null && Number.isFinite(recording.durationMs)
          ? recording.durationMs / 1000
          : undefined;

      const baseVersionToken = await getLatestVersionToken(
        recording.bibleTextId,
      );

      const response = await FluentAPI.uploadVerseAudio(
        {
          projectUnitId: recording.projectUnitId,
          bibleTextId: recording.bibleTextId,
          file: {
            uri: recording.localFilePath,
            name: fileNameFromPath(recording.localFilePath),
            type: contentTypeFromPath(recording.localFilePath),
          },
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
          ...(baseVersionToken !== undefined ? { baseVersionToken } : {}),
        },
        token,
      );

      if (response.conflictStatus === 'conflict') {
        // Set flag BEFORE transaction to prevent retries if transaction fails.
        // Upload already succeeded on server; transaction failure should not retry.
        didMarkConflicted = true;
        await markRecordingAndChapterConflicted(
          recording.id,
          recording.bibleTextId,
          response.versionToken,
        );
        log.info('Recording uploaded with conflict', {
          recordingId: recording.id,
          versionToken: response.versionToken,
          recordedByUserId: recording.recordedByUserId,
        });
        throwIfAborted(signal);
        return 'conflicted';
      }

      const blobKey = blobKeyFromVerseAudioResponse(response);
      await markRecordingUploaded(recording.id, blobKey, response.versionToken);
      didMarkUploaded = true;
      log.info('Recording uploaded', {
        recordingId: recording.id,
        blobKey,
        versionToken: response.versionToken,
        recordedByUserId: recording.recordedByUserId,
      });
      // Abort after a successful put still counts as uploaded (server has bytes).
      throwIfAborted(signal);
      return 'uploaded';
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        if (!didMarkUploaded && !didMarkConflicted) {
          await setRecordingSyncStatus(recording.id, 'pending');
        }
        throwIfAborted(signal);
        throw error;
      }

      if (isAuthError(error)) {
        await setRecordingSyncStatus(recording.id, 'pending');
        if (tokenUserId) {
          await handleUploadAuthFailure(tokenUserId);
        }
        log.error('Recording upload auth failure', {
          recordingId: recording.id,
          tokenUserId,
          error: error.message,
        });
        throw error;
      }

      // After successful conflict response, DB transaction failures are NOT retryable.
      // Upload was already accepted by server; retrying would create duplicate takes.
      if (didMarkConflicted) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to persist conflict state locally';
        log.error('DB transaction failed after conflict response', {
          recordingId: recording.id,
          error: message,
        });
        return 'failed';
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

  const delay = options.delay ?? defaultDelay;
  const maxAttempts = options.maxAttempts ?? MAX_UPLOAD_ATTEMPTS;
  const pending = await getPendingRecordings(options.chapter);

  log.info('Starting recording upload pass', {
    count: pending.length,
    chapter: options.chapter ?? null,
  });

  const total = pending.length;
  // Per-recording lifecycle events so UI can refresh without a manual bump.
  // Chapter-scoped orchestrator sessions also emit; listeners treat both as refresh signals.
  emitUploadSessionEvent({ type: 'start', totalChapters: total });

  let uploaded = 0;
  let conflicted = 0;
  let failed = 0;
  let completed = 0;

  try {
    for (const recording of pending) {
      throwIfAborted(options.signal);
      const { token: uploadToken, userId: tokenUserId } =
        await resolveUploadTokenForRecording(recording, token);
      const result = await uploadOneRecording(recording, {
        signal: options.signal,
        delay,
        maxAttempts,
        token: uploadToken,
        tokenUserId,
      });
      if (result === 'uploaded') {
        uploaded += 1;
      } else if (result === 'conflicted') {
        conflicted += 1;
      } else {
        failed += 1;
      }
      completed += 1;
      emitUploadSessionEvent({
        type: 'progress',
        completedChapters: completed,
        totalChapters: total,
      });
    }

    emitUploadSessionEvent({ type: 'complete' });
    log.info('Recording upload pass complete', {
      uploaded,
      conflicted,
      failed,
    });
    return { uploaded, conflicted, failed };
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      emitUploadSessionEvent({ type: 'cancelled' });
    } else {
      emitUploadSessionEvent({ type: 'idle' });
    }
    throw error;
  }
}

/**
 * Upload latest pending recordings (optionally filtered to one chapter).
 * Single-flight: overlapping calls share the in-flight promise.
 *
 * Attribution (#105): each recording uploads under its `recorded_by_user_id`
 * token when credentials exist; otherwise the pass `token` is used.
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
