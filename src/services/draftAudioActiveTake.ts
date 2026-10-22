import type {
  VerseAudioResponse,
  VerseAudioTakeResponse,
} from '../types/api/verseAudio';
import type { DraftAudioCoverage } from '../types/draftDownload/types';
import { createApiError } from './apiError';
import {
  coverageFromTake,
  isValidInclusiveCoverage,
} from './draftAudioCoverage';

export type ResolvedActiveTake = {
  take: VerseAudioTakeResponse;
  conflictStatus: VerseAudioResponse['conflictStatus'];
  bibleTextId: number;
  verseNumber: number;
  recordingId: number;
  /** Exact active-take coverage; null for older payloads without coverage keys. */
  coverage: DraftAudioCoverage | null;
};

/**
 * Canonical selected-take rule for draft download (#508 / #704 / #784):
 * exact `take.id === activeTakeId`. Reject null/missing/mismatched active.
 * Never use top-level `downloadUrl` or "latest take" — API455 sets top-level
 * `downloadUrl` to null when active is unavailable (no invent-take fallback).
 * Coverage comes from the matched take only (verse/pericope alternatives share
 * the same recording + projectUnitId + bibleTextId anchor).
 */
export function resolveActiveTakeDownload(
  item: VerseAudioResponse,
): ResolvedActiveTake {
  if (item.activeTakeId === null || item.activeTakeId === undefined) {
    throw createApiError(
      500,
      `Verse audio unit ${item.id} has no activeTakeId; refusing top-level URL fallback`,
    );
  }

  const take = item.takes.find(candidate => candidate.id === item.activeTakeId);
  if (!take) {
    throw createApiError(
      500,
      `Verse audio unit ${item.id}: activeTakeId ${item.activeTakeId} not present in takes[]`,
    );
  }

  if (typeof take.downloadUrl !== 'string' || take.downloadUrl.length === 0) {
    throw createApiError(
      500,
      `Verse audio unit ${item.id}: active take ${take.id} missing downloadUrl`,
    );
  }

  const coverage = coverageFromTake(take);
  if (coverage !== null && !isValidInclusiveCoverage(coverage)) {
    throw createApiError(
      500,
      `Verse audio unit ${item.id}: active take ${take.id} has invalid inclusive coverage`,
    );
  }

  return {
    take,
    conflictStatus: item.conflictStatus,
    bibleTextId: item.bibleTextId,
    verseNumber: item.verseNumber,
    recordingId: item.id,
    coverage,
  };
}

export function contentTypeToAudioExt(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (
    normalized.includes('mp4') ||
    normalized.includes('m4a') ||
    normalized.includes('aac')
  ) {
    return 'm4a';
  }
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('webm')) return 'webm';
  return 'm4a';
}
