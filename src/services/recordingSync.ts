import * as FileSystem from 'expo-file-system/legacy';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import type { PendingUploadChapter } from '../db/queries';
import {
  clearRecordingDeletion,
  getPendingRecordingDeletions,
  getPendingRecordings,
  getLatestVersionToken,
  markRecordingAndChapterConflicted,
  markRecordingFailed,
  markRecordingUploaded,
  raiseVerseVersionToken,
  setRecordingSyncStatus,
  updateRecordingVersionToken,
} from '../db/repository';
import type {
  PendingRecording,
  PendingRecordingDeletion,
} from '../types/db/types';
import { logger } from '../utils/logger';
import {
  isNetworkTransportError,
  UploadNetworkInterruptedError,
} from '../utils/networkError';
import { hasUsableRecordingRange } from '../utils/recordingRange';
import { isApiError } from '../types/api/errors';
import { FluentAPI } from './api';
import { isAuthError } from './authError';
import { authToken } from './authToken';
import { getCredentials } from './keychain';
import { getActiveUserId, setReauthRequired } from './storage';
import {
  blobKeyFromVerseAudioResponse,
  outcomeFromVerseAudioFailure,
  takeIdFromVerseAudioResponse,
} from './verseAudioContract';
import {
  emitAuthReauthRequired,
  emitUploadSessionEvent,
  type UploadSessionEvent,
} from './syncEvents';
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

function createAbortError(): Error {
  const error = new Error('Upload aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function awaitWithAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        cleanup();
        resolve(value);
      },
      error => {
        cleanup();
        reject(error);
      },
    );
  });
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
export async function resolveOwnerAuthToken(
  recordedByUserId: number | null,
  fallbackToken: string,
  context: { id: string },
): Promise<UploadTokenResolution> {
  if (recordedByUserId === null || !Number.isFinite(recordedByUserId)) {
    return { token: fallbackToken, userId: getActiveUserId() || null };
  }
  const userId = String(recordedByUserId);
  const creds = await getCredentials(userId);
  if (creds?.token) {
    return { token: creds.token, userId };
  }
  log.warn('Owner credentials missing; using active pass token', {
    id: context.id,
    recordedByUserId,
  });
  return { token: fallbackToken, userId: getActiveUserId() || null };
}

export async function resolveUploadTokenForRecording(
  recording: PendingRecording,
  fallbackToken: string,
): Promise<UploadTokenResolution> {
  return resolveOwnerAuthToken(recording.recordedByUserId, fallbackToken, {
    id: recording.id,
  });
}

/**
 * Canonical and selected takes become the server's active take; other takes
 * upload as stored-only alternates (#716).
 */
function shouldActivateTake(recording: PendingRecording): boolean {
  return recording.isCanonical || recording.isSelected;
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

  const isPericope = recording.granularity === 'pericope';
  let pericopeRange:
    | {
        startChapter: number;
        startVerse: number;
        endChapter: number;
        endVerse: number;
      }
    | undefined;
  if (isPericope) {
    const startChapter = recording.startChapter ?? 0;
    const startVerse = recording.startVerse ?? 0;
    const endChapter = recording.endChapter ?? 0;
    const endVerse = recording.endVerse ?? 0;
    if (
      !hasUsableRecordingRange({
        startChapter,
        startVerse,
        endChapter,
        endVerse,
      }) ||
      endChapter <= 0 ||
      endVerse <= 0
    ) {
      const message =
        'Missing or invalid pericope range for recording (start/end chapter and verse required)';
      log.error(message, {
        recordingId: recording.id,
        startChapter: recording.startChapter,
        startVerse: recording.startVerse,
        endChapter: recording.endChapter,
        endVerse: recording.endVerse,
      });
      await markRecordingFailed(recording.id, message);
      return 'failed';
    }
    pericopeRange = { startChapter, startVerse, endChapter, endVerse };
  }

  await setRecordingSyncStatus(recording.id, 'uploading');

  let lastMessage = 'Upload failed';
  let didMarkUploaded = false;
  let didAcceptCleanResponse = false;
  let didMarkConflicted = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);

    try {
      await assertLocalFileExists(recording.localFilePath);

      const activate = shouldActivateTake(recording);
      const durationSeconds =
        recording.durationMs !== null && Number.isFinite(recording.durationMs)
          ? recording.durationMs / 1000
          : undefined;

      const baseVersionToken = await getLatestVersionToken(
        recording.bibleTextId,
        recording.projectUnitId,
      );
      // Cancellation can arrive while local preflight is awaiting the DB.
      throwIfAborted(signal);

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
          ...(pericopeRange
            ? { granularity: 'pericope' as const, ...pericopeRange }
            : {}),
          activate,
        },
        token,
      );

      const serverTakeId = takeIdFromVerseAudioResponse(response, activate);

      // A stored-only take never changes the active selection, so a unit
      // already in conflict says nothing about this take.
      if (activate && response.conflictStatus === 'conflict') {
        // Set flag BEFORE transaction to prevent retries if transaction fails.
        // Upload already succeeded on server; transaction failure should not retry.
        didMarkConflicted = true;
        await markRecordingAndChapterConflicted(
          recording.id,
          recording.bibleTextId,
          response.versionToken,
          serverTakeId,
        );
        log.info('Recording uploaded with conflict', {
          recordingId: recording.id,
          versionToken: response.versionToken,
          recordedByUserId: recording.recordedByUserId,
          serverTakeId,
        });
        throwIfAborted(signal);
        return 'conflicted';
      }

      const blobKey = blobKeyFromVerseAudioResponse(response);
      // Server acceptance is distinct from the following local acknowledgement.
      didAcceptCleanResponse = true;
      await markRecordingUploaded(
        recording.id,
        blobKey,
        response.versionToken,
        serverTakeId,
      );
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

      // Accepted responses must not be resent because local persistence failed.
      // Leave local state for later reconciliation instead of replaying this PUT.
      if (didAcceptCleanResponse || didMarkConflicted) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to persist accepted upload locally';
        log.error('DB transaction failed after accepted upload response', {
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

      // Save currentVersionToken from 409 before retry to avoid stale token loop
      if (outcome.kind === 'retryable' && outcome.currentVersionToken) {
        try {
          await updateRecordingVersionToken(
            recording.id,
            outcome.currentVersionToken,
          );
          log.info('Saved currentVersionToken from 409 before retry', {
            recordingId: recording.id,
            currentVersionToken: outcome.currentVersionToken,
          });
        } catch (saveError) {
          log.error('Failed to save currentVersionToken from 409', {
            recordingId: recording.id,
            error:
              saveError instanceof Error ? saveError.message : 'Unknown error',
          });
          // Don't block retry - better to retry with stale token than fail completely
        }
      }

      if (!outcome.retryable || attempt === maxAttempts) {
        if (isNetworkTransportError(error)) {
          log.info('Upload paused after network failure; leaving pending', {
            recordingId: recording.id,
            attempt,
            message: lastMessage,
          });
          await setRecordingSyncStatus(recording.id, 'pending');
          throw new UploadNetworkInterruptedError(lastMessage);
        }

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

/** Distinct chapter in a pending pass. Orchestrator sessions key the same way. */
function chapterKey(recording: PendingRecording): string {
  return `${recording.bookId}:${recording.chapterNumber}`;
}

async function deleteOneRecordingTake(
  deletion: PendingRecordingDeletion,
  options: {
    signal?: AbortSignal;
    delay: (ms: number) => Promise<void>;
    maxAttempts: number;
    token: string;
    tokenUserId: string | null;
  },
): Promise<'deleted' | 'failed'> {
  const { signal, delay, maxAttempts, token, tokenUserId } = options;
  let lastMessage = 'Delete take failed';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);
    try {
      const { versionToken } = await FluentAPI.deleteVerseAudioTake(
        {
          projectUnitId: deletion.projectUnitId,
          bibleTextId: deletion.bibleTextId,
          takeId: deletion.serverTakeId,
        },
        token,
      );
      await clearRecordingDeletion(deletion.id);
      // Deleting the active take promotes another one and bumps the token;
      // the local promotion's activating upload must not send a stale base.
      if (versionToken !== null) {
        await raiseVerseVersionToken(
          deletion.bibleTextId,
          deletion.projectUnitId,
          versionToken,
        );
      }
      log.info('Recording take deleted on server', {
        deletionId: deletion.id,
        serverTakeId: deletion.serverTakeId,
      });
      return 'deleted';
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throwIfAborted(signal);
        throw error;
      }

      if (isApiError(error) && error.status === 404) {
        await clearRecordingDeletion(deletion.id);
        log.info('Recording take already absent on server', {
          deletionId: deletion.id,
          serverTakeId: deletion.serverTakeId,
        });
        return 'deleted';
      }

      if (isAuthError(error)) {
        if (tokenUserId) {
          await handleUploadAuthFailure(tokenUserId);
        }
        log.error('Recording take delete auth failure', {
          deletionId: deletion.id,
          tokenUserId,
          error: error.message,
        });
        throw error;
      }

      lastMessage =
        error instanceof Error ? error.message : 'Delete take failed';
      if (attempt === maxAttempts) {
        if (isNetworkTransportError(error)) {
          log.info(
            'Take delete paused after network failure; leaving pending',
            {
              deletionId: deletion.id,
              attempt,
              message: lastMessage,
            },
          );
          throw new UploadNetworkInterruptedError(lastMessage);
        }
        log.error('Recording take delete failed', {
          deletionId: deletion.id,
          attempt,
          message: lastMessage,
        });
        return 'failed';
      }

      log.warn('Recording take delete retrying', {
        deletionId: deletion.id,
        attempt,
        maxAttempts,
        message: lastMessage,
      });
      await delay(attempt * 500);
    }
  }

  return 'failed';
}

async function runDeletePass(
  token: string,
  options: {
    signal?: AbortSignal;
    delay: (ms: number) => Promise<void>;
    maxAttempts: number;
  },
): Promise<void> {
  const pending = await getPendingRecordingDeletions();
  if (pending.length === 0) {
    return;
  }

  log.info('Starting recording delete pass', { count: pending.length });

  for (const deletion of pending) {
    throwIfAborted(options.signal);
    const { token: deleteToken, userId: tokenUserId } =
      await resolveOwnerAuthToken(deletion.recordedByUserId, token, {
        id: deletion.id,
      });
    await deleteOneRecordingTake(deletion, {
      signal: options.signal,
      delay: options.delay,
      maxAttempts: options.maxAttempts,
      token: deleteToken,
      tokenUserId,
    });
  }
}

async function runUploadPass(
  token: string,
  options: RecordingSyncOptions = {},
): Promise<UploadResult> {
  // Fail fast if API base URL is missing (never use @env).
  getApiBaseUrl();

  const delay = options.delay ?? defaultDelay;
  const maxAttempts = options.maxAttempts ?? MAX_UPLOAD_ATTEMPTS;
  await runDeletePass(token, {
    signal: options.signal,
    delay,
    maxAttempts,
  });
  const pending = await getPendingRecordings(options.chapter);

  log.info('Starting recording upload pass', {
    count: pending.length,
    chapter: options.chapter ?? null,
  });

  // Chapter-scoped passes run inside an orchestrator session. That session
  // already emits start/progress/complete per chapter. Emitting the same
  // events here (per take, including complete) resets the Sync page and the
  // notification and can report more takes than chapters (#600).
  const orchestratorOwnsSession = options.chapter !== undefined;
  const emitPassEvent = (event: UploadSessionEvent): void => {
    if (orchestratorOwnsSession) {
      return;
    }
    emitUploadSessionEvent(event);
  };

  const takesLeftByChapter = new Map<string, number>();
  if (!orchestratorOwnsSession) {
    for (const recording of pending) {
      const key = chapterKey(recording);
      takesLeftByChapter.set(key, (takesLeftByChapter.get(key) ?? 0) + 1);
    }
  }
  const totalChapters = takesLeftByChapter.size;
  let completedChapters = 0;
  emitPassEvent({ type: 'start', totalChapters });

  let uploaded = 0;
  let conflicted = 0;
  let failed = 0;

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

      // Chapter workers never own session progress (#600 / #682). Failed takes
      // stay pending — do not count the chapter complete on a failed result.
      if (orchestratorOwnsSession || result === 'failed') {
        continue;
      }
      const key = chapterKey(recording);
      const left = (takesLeftByChapter.get(key) ?? 1) - 1;
      takesLeftByChapter.set(key, left);
      if (left === 0) {
        completedChapters += 1;
        emitPassEvent({
          type: 'progress',
          completedChapters,
          totalChapters,
        });
      }
    }

    emitPassEvent({ type: 'complete' });
    log.info('Recording upload pass complete', {
      uploaded,
      conflicted,
      failed,
    });
    return { uploaded, conflicted, failed };
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      emitPassEvent({ type: 'cancelled' });
    } else {
      emitPassEvent({ type: 'idle' });
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
    return awaitWithAbort(inFlight, options.signal);
  }

  inFlight = runUploadPass(token, options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Direct chapter upload helper (tests / ad-hoc callers). Production wires
 * `createChapterUploadWorker` via `registerRecordingUploadWorker` (#150).
 * Same failed-count contract as the registered worker.
 */
export async function uploadChapterRecordings(
  chapter: PendingUploadChapter,
  signal: AbortSignal,
  token?: string,
): Promise<void> {
  const resolved = token ?? authToken.get();
  if (!resolved) {
    throw new Error('No auth token available for chapter upload');
  }
  const result = await syncPendingRecordings(resolved, { chapter, signal });
  if (result.failed > 0) {
    throw new Error(`Chapter upload failed for ${result.failed} recording(s)`);
  }
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
      // Chapter-scoped passes stay silent (#682). Propagate hard failures so
      // the orchestrator can retry instead of emitting complete while work
      // still needs attention. Conflicts are successful server accepts.
      const result = await syncPendingRecordings(token, { chapter, signal });
      if (result.failed > 0) {
        throw new Error(
          `Chapter upload failed for ${result.failed} recording(s)`,
        );
      }
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
