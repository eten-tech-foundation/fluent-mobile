import { useEffect, useState } from 'react';
import {
  getChapterAssignmentById,
  getPericopesForChapter,
  getSelectedTakeCoverages,
} from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import type { ProjectChapter, WorkflowBadgeStage } from '../types/db/types';
import {
  buildBibleUnits,
  unitRecordedCount,
  type BibleUnitRecordedStatus,
  type BibleUnitVerse,
} from '../utils/bibleTabUnits';
import { logger } from '../utils/logger';
import { isPastDraft, isPastPeerCheck } from '../utils/workflowStage';

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
  /**
   * Verses with a take on this device, plus every verse in a chapter
   * submitted for peer check, since others' takes aren't downloaded.
   */
  recordedVerses: number;
  totalVerses: number;
  /** Every chapter it's in was submitted for peer check. */
  submitted: boolean;
  /** Every chapter it's in passed peer check. */
  peerChecked: boolean;
  /** Stable id the cover art is drawn from. */
  seed: string;
  /** The chapter it starts in, so a chapter's covers share a style. */
  groupSeed: string;
}

export type BookPassages =
  | { status: 'loading' }
  | {
      status: 'ready';
      byChapter: Map<number, BookPassage[]>;
      /** Some of it is pericopes; otherwise each chapter is recorded whole. */
      pericopes: boolean;
    };

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

function recordedStatusOf(
  recordedVerses: number,
  totalVerses: number,
): BibleUnitRecordedStatus {
  if (recordedVerses <= 0) return 'none';
  return recordedVerses >= totalVerses ? 'recorded' : 'partial';
}

const WHOLE_CHAPTER_KEY = 'chapter:';

function isWholeChapter(passage: BookPassage): boolean {
  return passage.key.startsWith(WHOLE_CHAPTER_KEY);
}

/** A chapter with no pericopes is one passage, tracked by verse counts. */
function wholeChapter(chapter: ProjectChapter): BookPassage {
  const recordedVerses = isPastDraft(chapter.workflowStage)
    ? chapter.totalVerses
    : chapter.completedVerses;
  return {
    key: `${WHOLE_CHAPTER_KEY}${chapter.id}`,
    title: null,
    reference: chapter.displayLabel,
    verses:
      chapter.totalVerses > 0
        ? `1–${chapter.totalVerses}`
        : chapter.displayLabel,
    anchorVerse: 1,
    recordedStatus: recordedStatusOf(recordedVerses, chapter.totalVerses),
    recordedVerses,
    totalVerses: chapter.totalVerses,
    submitted: isPastDraft(chapter.workflowStage),
    peerChecked: isPastPeerCheck(chapter.workflowStage),
    seed: `${chapter.bookName}:${chapter.chapterNumber}:chapter`,
    groupSeed: `${chapter.bookName}:${chapter.chapterNumber}`,
  };
}

type Coverages = ReturnType<typeof getSelectedTakeCoverages>;

/** Stage of another chapter in the same book, by chapter number. */
type StageOf = (chapterNumber: number) => WorkflowBadgeStage | null | undefined;

/**
 * One chapter's passages from the pericope set, with how much is recorded.
 * `stageOf` finds the other chapters a passage crosses into, and one it
 * can't find (in another milestone) counts as not started.
 */
async function loadPassages(
  chapter: ProjectChapter,
  pericopeSetId: number | null,
  coveragesFor: (bibleId: number, bookId: number) => Coverages,
  stageOf: StageOf,
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
  const stageIn = (n: number) =>
    n === chapterNumber ? chapter.workflowStage : stageOf(n) ?? null;
  return units.map((unit, i) => {
    const stages = new Map(
      unit.verses.map(v => [v.chapterNumber, stageIn(v.chapterNumber)]),
    );
    const inSubmitted = (v: BibleUnitVerse) =>
      isPastDraft(stages.get(v.chapterNumber));
    const recordedVerses =
      unit.verses.filter(inSubmitted).length +
      unitRecordedCount(
        unit.verses.filter(v => !inSubmitted(v)),
        coverages,
      );
    return {
      key: unit.key,
      title: groups[i]?.pericopeTitle?.trim() || null,
      reference: unit.title,
      verses: coverVerses(unit.verses, chapterNumber),
      anchorVerse: unit.anchorVerse,
      recordedStatus: recordedStatusOf(recordedVerses, unit.verses.length),
      recordedVerses,
      totalVerses: unit.verses.length,
      submitted: Array.from(stages.values()).every(isPastDraft),
      peerChecked: Array.from(stages.values()).every(isPastPeerCheck),
      // From the passage, not this chapter, so one crossing chapters looks the
      // same under both.
      seed: `${chapter.bookName}:${unit.key}`,
      groupSeed: `${chapter.bookName}:${
        unit.verses[0]?.chapterNumber ?? chapterNumber
      }`,
    };
  });
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
      const stages = new Map(
        chapters.map(c => [
          `${c.bookName}:${c.chapterNumber}`,
          c.workflowStage,
        ]),
      );
      const lists = await Promise.all(
        chapters.map(c =>
          loadPassages(c, pericopeSetId, coveragesFor, n =>
            stages.get(`${c.bookName}:${n}`),
          ),
        ),
      );
      return {
        byChapter: new Map(chapters.map((c, i) => [c.id, lists[i] ?? []])),
        pericopes: lists.some(list => list.some(p => !isWholeChapter(p))),
      };
    })()
      .then(loaded => {
        if (!cancelled) setPassages({ status: 'ready', ...loaded });
      })
      .catch(error => {
        log.error('Failed to load book passages', { error });
        if (!cancelled) {
          setPassages({
            status: 'ready',
            byChapter: new Map(chapters.map(c => [c.id, [wholeChapter(c)]])),
            pericopes: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chapters, projectId, projectUnitId]);

  return passages;
}
