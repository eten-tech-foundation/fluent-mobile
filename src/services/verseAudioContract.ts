import { isApiError } from '../types/api/errors';
import {
  verseAudioBlobKey,
  type VerseAudioResponse,
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
      /** Network (status 0) or other 5xx — backoff and retry in #100. */
      retryable: true;
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
  ] as const;

  for (const key of requiredNumbers) {
    if (!isFiniteNumber(body[key])) {
      throw createApiError(
        500,
        `Malformed verse audio response: missing ${key}`,
      );
    }
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
    verseNumber: body.verseNumber as number,
    downloadUrl: body.downloadUrl,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
  };
}
