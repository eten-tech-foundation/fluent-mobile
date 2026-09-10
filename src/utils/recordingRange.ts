import type { RecordingGranularity } from '../types/db/types';

export type { RecordingGranularity };

export type RecordingVerseRange = {
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
};

export type VerseViewRef = {
  bibleTextId: number;
  chapterNumber: number;
  verseNumber: number;
};

export type RecordingUnitCapture = {
  granularity: RecordingGranularity;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
  /** First verse of the unit — persist anchor / take_number scope. */
  anchorBibleTextId: number;
  coveredViews: VerseViewRef[];
};

/** True when stored chapter/verse range is usable for overlap (not a 0-backfill stub). */
export function hasUsableRecordingRange(range: RecordingVerseRange): boolean {
  return range.startChapter > 0 && range.startVerse > 0;
}

function tupleAtOrBefore(
  chapterA: number,
  verseA: number,
  chapterB: number,
  verseB: number,
): boolean {
  return chapterA < chapterB || (chapterA === chapterB && verseA <= verseB);
}

export function rangeCoversVerse(
  range: RecordingVerseRange,
  chapterNumber: number,
  verseNumber: number,
): boolean {
  return (
    tupleAtOrBefore(
      range.startChapter,
      range.startVerse,
      chapterNumber,
      verseNumber,
    ) &&
    tupleAtOrBefore(
      chapterNumber,
      verseNumber,
      range.endChapter,
      range.endVerse,
    )
  );
}

export function rangesOverlap(
  a: RecordingVerseRange,
  b: RecordingVerseRange,
): boolean {
  return (
    tupleAtOrBefore(a.startChapter, a.startVerse, b.endChapter, b.endVerse) &&
    tupleAtOrBefore(b.startChapter, b.startVerse, a.endChapter, a.endVerse)
  );
}

/**
 * Clear another take's selection when adding/selecting `incoming`.
 * Same `bible_text_id` always; overlapping stored ranges when both are usable.
 */
export function shouldClearSelectionForIncomingTake(
  existing: {
    id: string;
    bibleTextId: number;
    range: RecordingVerseRange;
  },
  incoming: {
    id?: string;
    bibleTextId: number;
    range: RecordingVerseRange;
  },
): boolean {
  if (incoming.id && existing.id === incoming.id) {
    return false;
  }
  if (existing.bibleTextId === incoming.bibleTextId) {
    return true;
  }
  if (
    !hasUsableRecordingRange(existing.range) ||
    !hasUsableRecordingRange(incoming.range)
  ) {
    return false;
  }
  return rangesOverlap(existing.range, incoming.range);
}
