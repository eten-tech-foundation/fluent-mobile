import { isApiError } from '../types/api/errors';
import {
  verseAudioBlobKey,
  type VerseAudioConflictStatus,
  type VerseAudioGranularity,
  type VerseAudioListResponse,
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
  return value === 'clean' || value === 'conflict' || value === 'resolved';
}

function isGranularity(value: unknown): value is VerseAudioGranularity {
  return value === 'verse' || value === 'pericope';
}

function isNullablePositiveInt(value: unknown): value is number | null {
  if (value === null) return true;
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

/**
 * Optional selected-canonical coverage (API455+).
 * Absent keys → older payload (omit fields). All five keys present → must be well-typed.
 * Partial key sets omit coverage (same as legacy) so upload GET/PUT parsing is not fail-closed
 * on half-populated wire; `coverageFromTake` yields null until the take carries a full range.
 */
function parseOptionalCoverage(
  body: Record<string, unknown>,
  label: string,
): {
  granularity?: VerseAudioGranularity;
  startChapter?: number | null;
  startVerse?: number | null;
  endChapter?: number | null;
  endVerse?: number | null;
} {
  const hasGranularity = Object.prototype.hasOwnProperty.call(
    body,
    'granularity',
  );
  const hasStartChapter = Object.prototype.hasOwnProperty.call(
    body,
    'startChapter',
  );
  const hasStartVerse = Object.prototype.hasOwnProperty.call(
    body,
    'startVerse',
  );
  const hasEndChapter = Object.prototype.hasOwnProperty.call(
    body,
    'endChapter',
  );
  const hasEndVerse = Object.prototype.hasOwnProperty.call(body, 'endVerse');
  const anyPresent =
    hasGranularity ||
    hasStartChapter ||
    hasStartVerse ||
    hasEndChapter ||
    hasEndVerse;

  if (!anyPresent) {
    return {};
  }

  const allPresent =
    hasGranularity &&
    hasStartChapter &&
    hasStartVerse &&
    hasEndChapter &&
    hasEndVerse;
  if (!allPresent) {
    return {};
  }

  if (!isGranularity(body.granularity)) {
    throw createApiError(
      500,
      `Malformed verse audio response: ${label} invalid granularity`,
    );
  }
  if (!isNullablePositiveInt(body.startChapter)) {
    throw createApiError(
      500,
      `Malformed verse audio response: ${label} invalid startChapter`,
    );
  }
  if (!isNullablePositiveInt(body.startVerse)) {
    throw createApiError(
      500,
      `Malformed verse audio response: ${label} invalid startVerse`,
    );
  }
  if (!isNullablePositiveInt(body.endChapter)) {
    throw createApiError(
      500,
      `Malformed verse audio response: ${label} invalid endChapter`,
    );
  }
  if (!isNullablePositiveInt(body.endVerse)) {
    throw createApiError(
      500,
      `Malformed verse audio response: ${label} invalid endVerse`,
    );
  }

  return {
    granularity: body.granularity,
    startChapter: body.startChapter,
    startVerse: body.startVerse,
    endChapter: body.endChapter,
    endVerse: body.endVerse,
  };
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
    ...parseOptionalCoverage(body, 'take'),
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
  // API455+: null when active is null/unmatched/empty; string when matched.
  // Empty string is still malformed. Older non-null string payloads remain valid.
  if (
    body.downloadUrl !== null &&
    (typeof body.downloadUrl !== 'string' || body.downloadUrl.length === 0)
  ) {
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
    ...parseOptionalCoverage(body, 'recording'),
    activeTakeId:
      body.activeTakeId === null || body.activeTakeId === undefined
        ? null
        : (body.activeTakeId as number),
    verseNumber: body.verseNumber as number,
    downloadUrl: body.downloadUrl as string | null,
    takes: body.takes.map(parseVerseAudioTake),
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
  };
}

/**
 * Narrows JSON from `GET /verse-audio?projectUnitId&bibleId&bookId&chapterNumber`.
 */
export function parseVerseAudioListResponse(
  data: unknown,
): VerseAudioListResponse {
  if (data === null || typeof data !== 'object') {
    throw createApiError(500, 'Malformed verse audio list response');
  }
  const body = data as Record<string, unknown>;
  if (!Array.isArray(body.items)) {
    throw createApiError(
      500,
      'Malformed verse audio list response: missing items',
    );
  }
  if (typeof body.hasConflict !== 'boolean') {
    throw createApiError(
      500,
      'Malformed verse audio list response: missing hasConflict',
    );
  }
  return {
    items: body.items.map(parseVerseAudioResponse),
    hasConflict: body.hasConflict,
  };
}

/**
 * Chapter list membership for draft hydration (#784 / API455).
 * Cross-chapter pericopes anchor on `startChapter`; drop duplicates by recording `id`
 * when a downstream chapter list repeats the same unit.
 */
export function filterChapterVerseAudioListItems(
  items: VerseAudioResponse[],
  chapterNumber: number,
): VerseAudioResponse[] {
  const seenRecordingIds = new Set<number>();
  const kept: VerseAudioResponse[] = [];

  for (const item of items) {
    if (
      item.startChapter !== undefined &&
      item.startChapter !== null &&
      item.startChapter !== chapterNumber
    ) {
      continue;
    }
    if (seenRecordingIds.has(item.id)) {
      continue;
    }
    seenRecordingIds.add(item.id);
    kept.push(item);
  }

  return kept;
}
