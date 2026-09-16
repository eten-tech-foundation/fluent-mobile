import type { DraftingUnit } from '../services/draftingUnitPreference';
import type { Recording } from '../types/db/types';

/** One verse take inside a stitched row, in pericope order. */
export type StitchSegment = {
  takeId: string;
  localFilePath: string;
  chapterNumber: number;
  verseNumber: number;
  durationMs: number | null;
};

export type RealTakeRow = {
  kind: 'real';
  take: Recording;
};

/**
 * Synthetic aggregate row (#411) — verse takes played back to back so pericope
 * view can still play what exists. Not a DB row: it has no `Recording` and its
 * granularity is display-only, never `recordings.granularity`.
 */
export type StitchedTakeRow = {
  kind: 'stitched';
  id: string;
  takeNumber: number;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
  /** Sum of segment durations; null when any segment duration is unknown. */
  durationMs: number | null;
  segments: StitchSegment[];
};

export type CrossGranularityRow = RealTakeRow | StitchedTakeRow;

export type PericopeVerseRef = {
  chapterNumber: number;
  verseNumber: number;
};

export type BuildCrossGranularityRowsArgs = {
  draftingUnit: DraftingUnit;
  pericopeVerses: PericopeVerseRef[];
  takes: Recording[];
};

const verseKey = (chapterNumber: number, verseNumber: number): string =>
  `${chapterNumber}:${verseNumber}`;

/**
 * Dedupe takes by id, preserving first-seen order.
 *
 * Needed because pericope view loads takes with one query **per covered verse**:
 * a single `getTakesForVerse` call cannot return a row twice, but a pericope
 * take covering vv. 3-5 comes back from all three calls.
 */
export function uniqueTakesById(groups: Recording[][]): Recording[] {
  const seen = new Set<string>();
  const merged: Recording[] = [];
  for (const group of groups) {
    for (const take of group) {
      if (seen.has(take.id)) {
        continue;
      }
      seen.add(take.id);
      merged.push(take);
    }
  }
  return merged;
}

/** User's selection wins; otherwise the newest attempt at that verse. */
function preferredTakeForVerse(candidates: Recording[]): Recording {
  const selected = candidates.find(take => take.isSelected);
  if (selected) {
    return selected;
  }
  return candidates.reduce((best, take) =>
    take.takeNumber > best.takeNumber ? take : best,
  );
}

function sumSegmentDurations(segments: StitchSegment[]): number | null {
  let total = 0;
  for (const segment of segments) {
    if (segment.durationMs === null) {
      return null;
    }
    total += segment.durationMs;
  }
  return total;
}

/**
 * Display rows for the My Takes list.
 *
 * Verse view is pass-through. Pericope view keeps native pericope takes as real
 * rows and collapses verse takes into **one** stitched row — individual verse
 * rows are not shown there, so a translator sees one playable draft per unit.
 * Coverage gaps are kept as a single span (v3 + v5 reads `vv. 3-5`).
 */
export function buildCrossGranularityRows({
  draftingUnit,
  pericopeVerses,
  takes,
}: BuildCrossGranularityRowsArgs): CrossGranularityRow[] {
  if (draftingUnit !== 'pericope') {
    return takes.map(take => ({ kind: 'real', take }));
  }

  const rows: CrossGranularityRow[] = [];
  const verseTakesByVerse = new Map<string, Recording[]>();

  for (const take of takes) {
    if (take.granularity === 'pericope') {
      rows.push({ kind: 'real', take });
      continue;
    }
    const key = verseKey(take.startChapter, take.startVerse);
    const existing = verseTakesByVerse.get(key);
    if (existing) {
      existing.push(take);
    } else {
      verseTakesByVerse.set(key, [take]);
    }
  }

  const segments: StitchSegment[] = [];
  for (const verse of pericopeVerses) {
    const candidates = verseTakesByVerse.get(
      verseKey(verse.chapterNumber, verse.verseNumber),
    );
    if (!candidates?.length) {
      continue;
    }
    const take = preferredTakeForVerse(candidates);
    segments.push({
      takeId: take.id,
      localFilePath: take.localFilePath,
      chapterNumber: verse.chapterNumber,
      verseNumber: verse.verseNumber,
      durationMs: take.durationMs ?? null,
    });
  }

  if (segments.length === 0) {
    return rows;
  }

  const first = segments[0];
  const last = segments[segments.length - 1];
  const firstTake = takes.find(take => take.id === first.takeId);

  rows.push({
    kind: 'stitched',
    // Stable across re-records: keyed by the span, not by member take ids.
    id: `stitched:${first.chapterNumber}:${first.verseNumber}-${last.chapterNumber}:${last.verseNumber}`,
    // Product default: the row inherits its lead segment's number rather than
    // counting stitched drafts, which have no persisted identity.
    takeNumber: firstTake?.takeNumber ?? 1,
    startChapter: first.chapterNumber,
    startVerse: first.verseNumber,
    endChapter: last.chapterNumber,
    endVerse: last.verseNumber,
    durationMs: sumSegmentDurations(segments),
    segments,
  });

  return rows;
}
