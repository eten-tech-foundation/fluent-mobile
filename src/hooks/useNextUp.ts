import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getDatabaseWriteMark,
  getMilestoneChapters,
  sameDatabaseWrites,
  type DatabaseWriteMark,
} from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import { parseUserId } from '../utils/parseUserId';
import type { MyWorkChapter } from '../types/db/types';
import { logger } from '../utils/logger';
import { markStartup } from '../utils/startupTrace';
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
/** Chapters whose passages load at once: the hero's and the rail's. */
export const LOAD_BATCH = 1 + AFTER_SIZE;

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
  // Tagged with the unit it was loaded under, so a switch doesn't show the old,
  // and with whether it saw any chapters: the empty pass before the first
  // read lands must not stand in for the chapters once they arrive.
  const [loaded, setLoaded] = useState<{
    nextUp: NextUp;
    unit: DraftingUnit;
    fromNoChapters: boolean;
  }>({
    nextUp: LOADING,
    unit: draftingUnit,
    fromNoChapters: true,
  });
  const readyWithDrafts = useRef(false);
  // The last load that read everything, for whom and at which write mark.
  const published = useRef<{
    chapters: MyWorkChapter[];
    unit: DraftingUnit;
    userId: number | null;
    writes: DatabaseWriteMark;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const userId = parseUserId();
      // Taken before the reads: a write landing during them counts as unseen.
      const writesBefore = getDatabaseWriteMark();
      const last = published.current;
      if (
        last &&
        last.chapters === chapters &&
        last.unit === draftingUnit &&
        last.userId === userId
      ) {
        // Back on Home with the same chapters: reload only after a write,
        // e.g. a take recorded on the passage screen.
        void writesBefore.then(writes => {
          if (cancelled || sameDatabaseWrites(last.writes, writes)) return;
          load();
        });
      } else {
        load();
      }
      return () => {
        cancelled = true;
      };

      function load() {
        let failed = false;
        const noteFailure = () => {
          failed = true;
        };
        const hasDrafts = draftingChapters(chapters).length > 0;
        // Chapters arrive after a first empty pass; don't show its empty state.
        if (hasDrafts && !readyWithDrafts.current) {
          setLoaded(prev =>
            prev.nextUp.status === 'loading'
              ? prev
              : { nextUp: LOADING, unit: draftingUnit, fromNoChapters: true },
          );
        }
        const ready = (result: {
          hero: NextPassage | null;
          after: NextPassage[];
        }) => {
          readyWithDrafts.current = hasDrafts;
          // The pass before chapters arrive is trivially ready; the one that
          // read them is the launch milestone.
          if (chapters.length > 0) {
            markStartup('nextup_ready', {
              hero: result.hero !== null,
              after: result.after.length,
            });
          }
          setLoaded({
            nextUp: {
              status: 'ready',
              ...result,
              checking: checkingPassages(chapters),
            },
            unit: draftingUnit,
            fromNoChapters: chapters.length === 0,
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
                    noteFailure();
                    return null;
                  });
          stageMaps.set(projectUnitId, pending);
          return pending;
        };

        const coveragesOf = (chapter: MyWorkChapter) => {
          const coveragesFor =
            coverages.get(chapter.projectUnitId) ??
            coverageLookup(chapter.projectUnitId, noteFailure);
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
              noteFailure();
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

        // Reads the passages of `LOAD_BATCH` chapters from `from` at once, in
        // list order. The rail needs at most the hero's chapter and
        // AFTER_SIZE more, so a batch bounds what a cold start waits on
        // without reading the whole list (#972). A failed read in a chapter
        // the scan never reaches still counts as a failure: a full reload
        // next focus is the safe side of that trade.
        const loadBatch = (list: MyWorkChapter[], from: number) =>
          Promise.all(
            list.slice(from, from + LOAD_BATCH).map(async chapter => ({
              chapter,
              passages: await passagesOf(chapter),
            })),
          );

        (async () => {
          let hero: NextPassage | null = null;
          const recordedHere = new Set<number>();
          const drafting = draftingChapters(chapters);
          // Ranges are per book, so chapters in one book share a read.
          await Promise.all(
            drafting
              .filter(chapter => chapter.completedVerses === 0)
              .map(async chapter => {
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
              }),
          );
          if (cancelled) return null;

          const started = startedChapters(chapters, recordedHere);
          for (let i = 0; i < started.length && !hero; i += LOAD_BATCH) {
            const batch = await loadBatch(started, i);
            if (cancelled) return null;
            for (const { chapter, passages } of batch) {
              const partial = passages.find(
                p => p.recordedStatus === 'partial',
              );
              if (partial) {
                hero = entry(chapter, partial);
                break;
              }
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
          const railFull = () => hero !== null && after.length >= AFTER_SIZE;
          for (let i = 0; i < drafting.length && !railFull(); i += LOAD_BATCH) {
            const batch = await loadBatch(drafting, i);
            if (cancelled) return null;
            for (const { chapter, passages } of batch) {
              if (railFull()) break;
              for (const passage of passages) {
                if (railFull()) break;
                if (passage.recordedStatus === 'recorded') continue;
                const bookKey = `${chapter.projectUnitId}:${chapter.bookName}:${passage.key}`;
                if (seen.has(bookKey)) continue;
                seen.add(bookKey);
                if (hero) after.push(entry(chapter, passage));
                else hero = entry(chapter, passage);
              }
            }
          }
          return { hero, after, writes: await writesBefore };
        })()
          .then(result => {
            if (cancelled || !result) return;
            const { writes, ...passages } = result;
            ready(passages);
            published.current =
              failed || !writes
                ? null
                : { chapters, unit: draftingUnit, userId, writes };
          })
          .catch(error => {
            log.error('Failed to load next up', { error });
            published.current = null;
            if (!cancelled) ready({ hero: null, after: [] });
          });
      }
    }, [chapters, draftingUnit]),
  );

  if (loaded.unit !== draftingUnit) return LOADING;
  if (loaded.fromNoChapters && chapters.length > 0) return LOADING;
  return loaded.nextUp;
}
