import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getMilestoneChapters } from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import { parseUserId } from '../utils/parseUserId';
import type { MyWorkChapter } from '../types/db/types';
import { logger } from '../utils/logger';
import type { DraftingUnit } from '../services/draftingUnitPreference';
import { useDraftingUnit } from './useDraftingUnit';
import {
  coverageLookup,
  loadChapterPassages,
  wholeChapter,
  type BookPassage,
  type CoveragesFor,
} from './useBookPassages';

const log = logger.create('useNextUp');

export const AFTER_SIZE = 4;

export interface NextPassage {
  key: string;
  chapter: MyWorkChapter;
  passage: BookPassage;
}

export type NextUp =
  | { status: 'loading' }
  | {
      status: 'ready';
      hero: NextPassage | null;
      after: NextPassage[];
      /** My Work's other rows: peer checks, open peer checks, observing. */
      checking: NextPassage[];
    };

function isDrafting(c: MyWorkChapter): boolean {
  return (
    c.ownershipState === 'mine' &&
    (c.workflowStage === 'draft' || c.workflowStage === 'not_started')
  );
}

/** Chapters I'm drafting, in book order as they arrive. */
export function draftingChapters(chapters: MyWorkChapter[]): MyWorkChapter[] {
  return chapters.filter(isDrafting);
}

/**
 * The rest of Legacy My Work, a whole chapter each: what I peer check, open
 * peer checks a Translator can take, and chapters I observe.
 */
export function checkingPassages(chapters: MyWorkChapter[]): NextPassage[] {
  return chapters
    .filter(c => !isDrafting(c))
    .map(chapter => {
      const passage = wholeChapter(chapter);
      return { key: `${chapter.id}:${passage.key}`, chapter, passage };
    });
}

/**
 * Drafting chapters with something recorded, the one worked on last first.
 * `recordedHere` holds chapters with takes on this phone the stored count lags.
 */
export function startedChapters(
  chapters: MyWorkChapter[],
  recordedHere: ReadonlySet<number> = new Set(),
): MyWorkChapter[] {
  const activity = (c: MyWorkChapter) =>
    c.lastActivityAt ? Date.parse(c.lastActivityAt) || 0 : 0;
  return draftingChapters(chapters)
    .filter(c => c.completedVerses > 0 || recordedHere.has(c.id))
    .sort((a, b) => activity(b) - activity(a));
}

const LOADING: NextUp = { status: 'loading' };

/**
 * Home's "Next up": the one passage to record now, then the few after it,
 * then the chapters I'm checking or observing.
 * The hero keeps going on a part-recorded passage in the chapter I worked on
 * last; otherwise it's the first unrecorded passage in book order. The rest
 * are always the first unrecorded passages in book order, so they can come
 * before a keep-going hero. Reloads on focus, so a passage recorded on the
 * player moves on when I come back.
 */
export function useNextUp(chapters: MyWorkChapter[]): NextUp {
  const { draftingUnit } = useDraftingUnit();
  // Tagged with the unit it was loaded under, so a switch doesn't show the old.
  const [loaded, setLoaded] = useState<{ nextUp: NextUp; unit: DraftingUnit }>({
    nextUp: LOADING,
    unit: draftingUnit,
  });
  const readyWithDrafts = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const hasDrafts = draftingChapters(chapters).length > 0;
      // Chapters arrive after a first empty pass; don't show its empty state.
      if (hasDrafts && !readyWithDrafts.current) {
        setLoaded(prev =>
          prev.nextUp.status === 'loading'
            ? prev
            : { nextUp: LOADING, unit: draftingUnit },
        );
      }
      const ready = (result: {
        hero: NextPassage | null;
        after: NextPassage[];
      }) => {
        readyWithDrafts.current = hasDrafts;
        setLoaded({
          nextUp: {
            status: 'ready',
            ...result,
            checking: checkingPassages(chapters),
          },
          unit: draftingUnit,
        });
      };
      // Verse by verse works through whole chapters, as Legacy does.
      const byVerse = draftingUnit === 'verse';
      const pericopeSets = new Map<number, Promise<number | null>>();
      const coverages = new Map<number, CoveragesFor>();
      const stageMaps = new Map<
        number,
        Promise<Map<string, MyWorkChapter['workflowStage']> | null>
      >();
      const passageLists = new Map<number, Promise<BookPassage[]>>();

      const stagesFor = (projectUnitId: number) => {
        const cached = stageMaps.get(projectUnitId);
        if (cached) return cached;
        const userId = parseUserId();
        const pending =
          userId === null
            ? Promise.resolve(null)
            : getMilestoneChapters(projectUnitId, userId)
                .then(rows => {
                  const stages = new Map<
                    string,
                    MyWorkChapter['workflowStage']
                  >();
                  for (const row of rows) {
                    stages.set(
                      `${row.bookName}:${row.chapterNumber}`,
                      row.workflowStage,
                    );
                  }
                  return stages;
                })
                .catch(error => {
                  log.error('Failed to load milestone stages', { error });
                  return null;
                });
        stageMaps.set(projectUnitId, pending);
        return pending;
      };

      const coveragesOf = (chapter: MyWorkChapter) => {
        const coveragesFor =
          coverages.get(chapter.projectUnitId) ??
          coverageLookup(chapter.projectUnitId);
        coverages.set(chapter.projectUnitId, coveragesFor);
        return coveragesFor;
      };

      const passagesOf = (chapter: MyWorkChapter) => {
        const cached = passageLists.get(chapter.id);
        if (cached) return cached;
        const pericopeSetId =
          pericopeSets.get(chapter.projectId) ??
          (byVerse
            ? Promise.resolve(null)
            : getProjectPericopeSetId(chapter.projectId));
        pericopeSets.set(chapter.projectId, pericopeSetId);
        const coveragesFor = coveragesOf(chapter);
        const passages = Promise.all([
          pericopeSetId,
          stagesFor(chapter.projectUnitId),
        ])
          .then(([setId, stages]) =>
            loadChapterPassages(
              chapter,
              setId,
              coveragesFor,
              stages
                ? chapterNumber =>
                    stages.get(`${chapter.bookName}:${chapterNumber}`)
                : undefined,
            ),
          )
          .catch(error => {
            log.error('Failed to load passages', { error });
            return [wholeChapter(chapter)];
          });
        passageLists.set(chapter.id, passages);
        return passages;
      };
      const entry = (chapter: MyWorkChapter, passage: BookPassage) => ({
        key: `${chapter.id}:${passage.key}`,
        chapter,
        passage,
      });

      (async () => {
        let hero: NextPassage | null = null;
        const recordedHere = new Set<number>();
        for (const chapter of draftingChapters(chapters)) {
          if (chapter.completedVerses > 0) continue;
          const ranges = await coveragesOf(chapter)(
            chapter.bibleId,
            chapter.bookId,
          );
          const here = ranges.some(
            r =>
              r.startChapter <= chapter.chapterNumber &&
              r.endChapter >= chapter.chapterNumber,
          );
          if (here) recordedHere.add(chapter.id);
        }
        for (const chapter of startedChapters(chapters, recordedHere)) {
          if (cancelled) return null;
          const partial = (await passagesOf(chapter)).find(
            p => p.recordedStatus === 'partial',
          );
          if (partial) {
            hero = entry(chapter, partial);
            break;
          }
        }

        const after: NextPassage[] = [];
        // A passage that crosses chapters is in both chapters' lists.
        const seen = new Set<string>();
        if (hero) {
          seen.add(
            `${hero.chapter.projectUnitId}:${hero.chapter.bookName}:${hero.passage.key}`,
          );
        }
        for (const chapter of draftingChapters(chapters)) {
          if (cancelled) return null;
          if (hero && after.length >= AFTER_SIZE) break;
          for (const passage of await passagesOf(chapter)) {
            if (hero && after.length >= AFTER_SIZE) break;
            if (passage.recordedStatus === 'recorded') continue;
            const bookKey = `${chapter.projectUnitId}:${chapter.bookName}:${passage.key}`;
            if (seen.has(bookKey)) continue;
            seen.add(bookKey);
            if (hero) after.push(entry(chapter, passage));
            else hero = entry(chapter, passage);
          }
        }
        return { hero, after };
      })()
        .then(result => {
          if (!cancelled && result) ready(result);
        })
        .catch(error => {
          log.error('Failed to load next up', { error });
          if (!cancelled) ready({ hero: null, after: [] });
        });

      return () => {
        cancelled = true;
      };
    }, [chapters, draftingUnit]),
  );

  return loaded.unit === draftingUnit ? loaded.nextUp : LOADING;
}
