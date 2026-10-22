import type { DraftAudioCoverage } from '../../types/draftDownload/types';
import { formatTakeVerseSpan } from '../../utils/takeSubtitle';

/**
 * Published download-lane coverage projection (PR #784). Re-exported so the
 * Observer renderer does not redefine D-owned fields.
 */
export type ObserverDraftAudioCoverage = DraftAudioCoverage;

function isPositiveInt(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** True only when every bound is a verified positive integer — never invent. */
export function hasCompleteObserverCoverage(
  coverage: ObserverDraftAudioCoverage,
): coverage is ObserverDraftAudioCoverage & {
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
} {
  return (
    isPositiveInt(coverage.startChapter) &&
    isPositiveInt(coverage.startVerse) &&
    isPositiveInt(coverage.endChapter) &&
    isPositiveInt(coverage.endVerse)
  );
}

/** Inclusive start≤end in chapter:verse order; reversed/malformed fail closed. */
export function isWellOrderedObserverCoverage(coverage: {
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}): boolean {
  if (coverage.startChapter < coverage.endChapter) {
    return true;
  }
  if (coverage.startChapter > coverage.endChapter) {
    return false;
  }
  return coverage.startVerse <= coverage.endVerse;
}

function granularityWord(
  granularity: ObserverDraftAudioCoverage['granularity'],
): 'Verse' | 'Pericope' {
  return granularity === 'pericope' ? 'Pericope' : 'Verse';
}

/** Neutral anchor when wire coverage is absent — no Verse/Pericope claim. */
export function formatNeutralCanonicalAnchorLabel(
  anchorVerseNumber: number,
): string {
  return `Canonical draft - v. ${anchorVerseNumber}`;
}

/** Known granularity but unverified/unusable bounds — no invented range. */
export function formatRangeUnavailableCanonicalLabel(
  granularity: ObserverDraftAudioCoverage['granularity'],
  anchorVerseNumber: number,
): string {
  return `Canonical draft - ${granularityWord(
    granularity,
  )} - Range unavailable - v. ${anchorVerseNumber}`;
}

/**
 * Legacy-familiar canonical label for Observer DraftTakeRow.
 * - null/undefined → neutral anchor (no Verse/Pericope claim)
 * - partial / reversed → preserve known granularity + range unavailable + anchor
 * - complete well-ordered → Verse/Pericope + formatTakeVerseSpan (full bounds)
 */
export function formatCanonicalObserverDraftLabel(
  anchorVerseNumber: number,
  coverage: ObserverDraftAudioCoverage | null | undefined,
): string {
  if (coverage === null || coverage === undefined) {
    return formatNeutralCanonicalAnchorLabel(anchorVerseNumber);
  }

  if (!hasCompleteObserverCoverage(coverage)) {
    return formatRangeUnavailableCanonicalLabel(
      coverage.granularity,
      anchorVerseNumber,
    );
  }

  if (!isWellOrderedObserverCoverage(coverage)) {
    return formatRangeUnavailableCanonicalLabel(
      coverage.granularity,
      anchorVerseNumber,
    );
  }

  return `Canonical draft - ${granularityWord(
    coverage.granularity,
  )} - ${formatTakeVerseSpan(coverage)}`;
}
