import type { TranslatedVerseResponse } from '../types/api/translatedVerse';
import { createApiError } from './apiError';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseMarkers(value: unknown): TranslatedVerseResponse['markers'] {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object') {
    return null;
  }
  return value as TranslatedVerseResponse['markers'];
}

export function parseTranslatedVerseResponse(
  data: unknown,
): TranslatedVerseResponse {
  if (data === null || typeof data !== 'object') {
    throw createApiError(500, 'Malformed translated verse response');
  }
  const body = data as Record<string, unknown>;
  const requiredNumbers = [
    'id',
    'projectUnitId',
    'bibleTextId',
    'verseNumber',
  ] as const;
  for (const key of requiredNumbers) {
    if (!isFiniteNumber(body[key])) {
      throw createApiError(
        500,
        `Malformed translated verse response: missing ${key}`,
      );
    }
  }
  if (typeof body.content !== 'string') {
    throw createApiError(
      500,
      'Malformed translated verse response: missing content',
    );
  }
  if (
    typeof body.createdAt !== 'string' ||
    typeof body.updatedAt !== 'string'
  ) {
    throw createApiError(
      500,
      'Malformed translated verse response: missing timestamps',
    );
  }
  if (
    body.assignedUserId !== null &&
    body.assignedUserId !== undefined &&
    !isFiniteNumber(body.assignedUserId)
  ) {
    throw createApiError(
      500,
      'Malformed translated verse response: invalid assignedUserId',
    );
  }

  return {
    id: body.id as number,
    projectUnitId: body.projectUnitId as number,
    bibleTextId: body.bibleTextId as number,
    assignedUserId:
      body.assignedUserId === null || body.assignedUserId === undefined
        ? null
        : (body.assignedUserId as number),
    content: body.content,
    markers: parseMarkers(body.markers),
    verseNumber: body.verseNumber as number,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
  };
}

export function parseTranslatedVersesResponse(
  data: unknown,
): TranslatedVerseResponse[] {
  if (!Array.isArray(data)) {
    throw createApiError(500, 'Malformed translated verses list response');
  }
  return data.map(parseTranslatedVerseResponse);
}
