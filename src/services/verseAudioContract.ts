import { isApiError } from '../types/api/errors';
import {
  verseAudioBlobKey,
  type VerseAudioConflictStatus,
  type VerseAudioResponse,
  type VerseAudioTakeResponse,
} from '../types/api/verseAudio';
import { createApiError } from './apiError';

/**
 * How #100's upload worker should treat a finished verse-audio upload attempt.
 * Aligns with `ApiError.isRetryable` / `isTerminal`, with `503` treated as
 * terminal (storage unconfigured — retrying will not help).
 */
export type VerseAudioUploadClientOutcome =
  | { kind: 'uploaded'; blobKey: string; recordingId: number }
  | {
      kind: 'failed';
      message: string;
      /** Terminal client/config error — do not retry. */
      retryable: false;
    }
  | {
      kind: 'retryable';
      message: string;
      /** Network (status 0), 409 CAS race, or other 5xx — backoff and retry. */
      retryable: true;
      /** Current server version token from 409 response (for retry with updated token). */
      currentVersionToken?: number;
    };

/** Persist into local `recordings.blob_key` (matches server `audioBlobName`). */
export function blobKeyFromVerseAudioResponse(
  response: VerseAudioResponse,
): string {
  return verseAudioBlobKey(response.projectUnitId, response.bibleTextId);
}

export function outcomeFromVerseAudioSuccess(
  response: VerseAudioResponse,
): VerseAudioUploadClientOutcome {
  return {
    kind: 'uploaded',
    blobKey: blobKeyFromVerseAudioResponse(response),
    recordingId: response.id,
  };
}

export function outcomeFromVerseAudioFailure(
  error: unknown,
): Exclude<VerseAudioUploadClientOutcome, { kind: 'uploaded' }> {
  if (isApiError(error)) {
    // Storage not configured — permanent for this environment.
    if (error.status === 503) {
      return { kind: 'failed', message: error.message, retryable: false };
    }
    // Compare-and-swap race — extract currentVersionToken for retry.
    if (error.status === 409) {
      const currentVersionToken =
        typeof error.body?.currentVersionToken === 'number'
          ? error.body.currentVersionToken
          : undefined;

      return {
        kind: 'retryable',
        message: error.message,
        retryable: true,
        currentVersionToken,
      };
    }
    if (error.isRetryable) {
      return { kind: 'retryable', message: error.message, retryable: true };
    }
    return { kind: 'failed', message: error.message, retryable: false };
  }

  const message =
    error instanceof Error ? error.message : 'Verse audio upload failed';
  return { kind: 'retryable', message, retryable: true };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isConflictStatus(value: unknown): value is VerseAudioConflictStatus {
  return value === 'clean' || value === 'conflict';
}

function parseVerseAudioTake(data: unknown): VerseAudioTakeResponse {
  if (data === null || typeof data !== 'object') {
    throw createApiError(500, 'Malformed verse audio response: invalid take');
  }

  const body = data as Record<string, unknown>;
  const requiredNumbers = ['id', 'uploadedBy', 'sizeBytes'] as const;

  for (const key of requiredNumbers) {
    if (!isFiniteNumber(body[key])) {
      throw createApiError(
        500,
        `Malformed verse audio response: take missing ${key}`,
      );
    }
  }

  if (typeof body.contentType !== 'string' || body.contentType.length === 0) {
    throw createApiError(
      500,
      'Malformed verse audio response: take missing contentType',
    );
  }
  if (typeof body.contentHash !== 'string' || body.contentHash.length === 0) {
    throw createApiError(
      500,
      'Malformed verse audio response: take missing contentHash',
    );
  }
  if (typeof body.downloadUrl !== 'string' || body.downloadUrl.length === 0) {
    throw createApiError(
      500,
      'Malformed verse audio response: take missing downloadUrl',
    );
  }
  if (
    typeof body.createdAt !== 'string' ||
    typeof body.updatedAt !== 'string'
  ) {
    throw createApiError(
      500,
      'Malformed verse audio response: take missing timestamps',
    );
  }

  const durationSeconds =
    body.durationSeconds === null
      ? null
      : isFiniteNumber(body.durationSeconds)
      ? body.durationSeconds
      : null;

  return {
    id: body.id as number,
    uploadedBy: body.uploadedBy as number,
    contentType: body.contentType,
    sizeBytes: body.sizeBytes as number,
    durationSeconds,
    contentHash: body.contentHash,
    downloadUrl: body.downloadUrl,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
  };
}

/**
 * Narrows JSON from `PUT/GET /verse-audio/...` to `VerseAudioResponse`.
 * Throws `ApiError` (status 500) when the body is missing required fields.
 */
export function parseVerseAudioResponse(data: unknown): VerseAudioResponse {
  if (data === null || typeof data !== 'object') {
    throw createApiError(500, 'Malformed verse audio response');
  }

  const body = data as Record<string, unknown>;
  const requiredNumbers = [
    'id',
    'projectUnitId',
    'bibleTextId',
    'uploadedBy',
    'sizeBytes',
    'verseNumber',
    'versionToken',
  ] as const;

  for (const key of requiredNumbers) {
    if (!isFiniteNumber(body[key])) {
      throw createApiError(
        500,
        `Malformed verse audio response: missing ${key}`,
      );
    }
  }

  if (!isConflictStatus(body.conflictStatus)) {
    throw createApiError(
      500,
      'Malformed verse audio response: missing conflictStatus',
    );
  }

  if (
    body.activeTakeId !== null &&
    body.activeTakeId !== undefined &&
    !isFiniteNumber(body.activeTakeId)
  ) {
    throw createApiError(
      500,
      'Malformed verse audio response: invalid activeTakeId',
    );
  }

  if (typeof body.contentType !== 'string' || body.contentType.length === 0) {
    throw createApiError(
      500,
      'Malformed verse audio response: missing contentType',
    );
  }
  if (typeof body.downloadUrl !== 'string' || body.downloadUrl.length === 0) {
    throw createApiError(
      500,
      'Malformed verse audio response: missing downloadUrl',
    );
  }
  if (
    typeof body.createdAt !== 'string' ||
    typeof body.updatedAt !== 'string'
  ) {
    throw createApiError(
      500,
      'Malformed verse audio response: missing timestamps',
    );
  }

  if (!Array.isArray(body.takes)) {
    throw createApiError(500, 'Malformed verse audio response: missing takes');
  }

  const durationSeconds =
    body.durationSeconds === null
      ? null
      : isFiniteNumber(body.durationSeconds)
      ? body.durationSeconds
      : null;

  return {
    id: body.id as number,
    projectUnitId: body.projectUnitId as number,
    bibleTextId: body.bibleTextId as number,
    uploadedBy: body.uploadedBy as number,
    contentType: body.contentType,
    sizeBytes: body.sizeBytes as number,
    durationSeconds,
    versionToken: body.versionToken as number,
    conflictStatus: body.conflictStatus,
    activeTakeId:
      body.activeTakeId === null || body.activeTakeId === undefined
        ? null
        : (body.activeTakeId as number),
    verseNumber: body.verseNumber as number,
    downloadUrl: body.downloadUrl,
    takes: body.takes.map(parseVerseAudioTake),
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
  };
}
