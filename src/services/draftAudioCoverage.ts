import type { VerseAudioTakeResponse } from '../types/api/verseAudio';
import type {
  DraftAudioCoverage,
  DraftAudioGranularity,
} from '../types/draftDownload/types';

function isGranularity(value: unknown): value is DraftAudioGranularity {
  return value === 'verse' || value === 'pericope';
}

function isNullablePositiveInt(value: unknown): value is number | null {
  if (value === null) return true;
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

/**
 * Extract coverage from an exact matched take.
 * Returns null when any coverage key is absent (older / partial payload) —
 * never invents null bounds for missing keys.
 */
export function coverageFromTake(
  take: Pick<
    VerseAudioTakeResponse,
    'granularity' | 'startChapter' | 'startVerse' | 'endChapter' | 'endVerse'
  >,
): DraftAudioCoverage | null {
  if (
    take.granularity === undefined ||
    take.startChapter === undefined ||
    take.startVerse === undefined ||
    take.endChapter === undefined ||
    take.endVerse === undefined
  ) {
    return null;
  }
  if (!isGranularity(take.granularity)) {
    return null;
  }
  return {
    granularity: take.granularity,
    startChapter: take.startChapter,
    startVerse: take.startVerse,
    endChapter: take.endChapter,
    endVerse: take.endVerse,
  };
}

/**
 * Inclusive coverage ordering when all four bounds are finite positives.
 * Null bounds are allowed (unhydrated / passthrough) and skip geometric checks.
 */
export function isValidInclusiveCoverage(
  coverage: DraftAudioCoverage,
): boolean {
  if (!isGranularity(coverage.granularity)) {
    return false;
  }
  const bounds = [
    coverage.startChapter,
    coverage.startVerse,
    coverage.endChapter,
    coverage.endVerse,
  ];
  if (bounds.every(value => value === null)) {
    return true;
  }
  if (!bounds.every(isNullablePositiveInt)) {
    return false;
  }
  if (bounds.some(value => value === null)) {
    // Partial nulls are not a valid hydrated range — refuse rather than invent.
    return false;
  }
  const startChapter = coverage.startChapter as number;
  const startVerse = coverage.startVerse as number;
  const endChapter = coverage.endChapter as number;
  const endVerse = coverage.endVerse as number;
  if (startChapter > endChapter) {
    return false;
  }
  if (startChapter === endChapter && startVerse > endVerse) {
    return false;
  }
  return true;
}
