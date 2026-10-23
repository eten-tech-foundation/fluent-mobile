import { useEffect, useState } from 'react';
import {
  getChapterAssignmentById,
  getPericopesForChapter,
  getSelectedTakeCoverages,
} from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import type { ProjectChapter } from '../types/db/types';
import {
  buildBibleUnits,
  unitRecordedStatus,
  type BibleUnitRecordedStatus,
  type BibleUnitVerse,
} from '../utils/bibleTabUnits';
import { logger } from '../utils/logger';

const log = logger.create('useBookPassages');

export interface BookPassage {
  key: string;
  /** Pericope title; null when the set has none, or for a whole chapter. */
  title: string | null;
  /** e.g. "Mark 14:22–25". */
  reference: string;
  /** Verse range for the cover, e.g. "22–25", or "14:72–15:5" across chapters. */
  verses: string;
  /** Verse in this chapter that drafting opens at. */
  anchorVerse: number;
  recordedStatus: BibleUnitRecordedStatus;
}

export type BookPassages =
  | { status: 'loading' }
  | { status: 'ready'; byChapter: Map<number, BookPassage[]> };

export function coverVerses(
  verses: BibleUnitVerse[],
  chapterNumber: number,
): string {
  const first = verses[0];
  const last = verses[verses.length - 1];
  if (!first || !last) return '';
  if (first.chapterNumber !== last.chapterNumber) {
    return `${first.chapterNumber}:${first.verseNumber}–${last.chapterNumber}:${last.verseNumber}`;
  }
  if (first.chapterNumber !== chapterNumber) {
    return `${first.chapterNumber}:${first.verseNumber}–${last.verseNumber}`;
  }
  return first.verseNumber === last.verseNumber
    ? String(first.verseNumber)
    : `${first.verseNumber}–${last.verseNumber}`;
}

/** A chapter with no pericopes is one passage, tracked by verse counts. */
function wholeChapter(chapter: ProjectChapter): BookPassage {
  const recordedStatus: BibleUnitRecordedStatus =
    chapter.completedVerses === 0
      ? 'none'
      : chapter.completedVerses >= chapter.totalVerses
      ? 'recorded'
      : 'partial';
  return {
    key: `chapter:${chapter.id}`,
    title: null,
    reference: chapter.displayLabel,
    verses:
      chapter.totalVerses > 0
        ? `1–${chapter.totalVerses}`
        : chapter.displayLabel,
    anchorVerse: 1,
    recordedStatus,
  };
}

type Coverages = ReturnType<typeof getSelectedTakeCoverages>;

async function loadPassages(
  chapter: ProjectChapter,
  pericopeSetId: number | null,
  coveragesFor: (bibleId: number, bookId: number) => Coverages,
): Promise<BookPassage[]> {
  const assignment = await getChapterAssignmentById(chapter.id);
  if (!assignment || pericopeSetId === null) return [wholeChapter(chapter)];
  const { bibleId, bookId, chapterNumber } = assignment;
  const [groups, coverages] = await Promise.all([
    getPericopesForChapter(bookId, chapterNumber, pericopeSetId),
    coveragesFor(bibleId, bookId),
  ]);
  if (groups.length === 0) return [wholeChapter(chapter)];

  const units = buildBibleUnits({
    draftingUnit: 'pericope',
    verses: [],
    pericopes: groups,
    chapterNumber,
    chapterName: chapter.displayLabel,
    bookName: chapter.bookName,
  });
  return units.map((unit, i) => ({
    key: unit.key,
    title: groups[i]?.pericopeTitle?.trim() || null,
    reference: unit.title,
    verses: coverVerses(unit.verses, chapterNumber),
    anchorVerse: unit.anchorVerse,
    recordedStatus: unitRecordedStatus(unit.verses, coverages),
  }));
}

/**
 * Each chapter's passages from the project's pericope set, with how much of
 * each is recorded, read from the local DB like the Legacy Bible tab.
 * Reloads whenever `chapters` changes, so returning from drafting refreshes it.
 */
export function useBookPassages(
  chapters: ProjectChapter[],
  projectId: number,
  projectUnitId: number,
): BookPassages {
  const [passages, setPassages] = useState<BookPassages>({
    status: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    // Coverage is per book, and a milestone's chapters usually share one.
    const coverages = new Map<string, Coverages>();
    const coveragesFor = (bibleId: number, bookId: number) => {
      const key = `${bibleId}:${bookId}`;
      let found = coverages.get(key);
      if (!found) {
        found = getSelectedTakeCoverages(bibleId, bookId, projectUnitId);
        coverages.set(key, found);
      }
      return found;
    };
    (async () => {
      const pericopeSetId = await getProjectPericopeSetId(projectId);
      const lists = await Promise.all(
        chapters.map(c => loadPassages(c, pericopeSetId, coveragesFor)),
      );
      return new Map(chapters.map((c, i) => [c.id, lists[i] ?? []]));
    })()
      .then(byChapter => {
        if (!cancelled) setPassages({ status: 'ready', byChapter });
      })
      .catch(error => {
        log.error('Failed to load book passages', { error });
        if (!cancelled) {
          setPassages({
            status: 'ready',
            byChapter: new Map(chapters.map(c => [c.id, [wholeChapter(c)]])),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chapters, projectId, projectUnitId]);

  return passages;
}
