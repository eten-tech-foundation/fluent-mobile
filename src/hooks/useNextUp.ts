import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getProjectPericopeSetId } from '../db/repository';
import type { MyWorkChapter } from '../types/db/types';
import { logger } from '../utils/logger';
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
  | { status: 'ready'; hero: NextPassage | null; after: NextPassage[] };

/** Chapters I'm drafting, in book order as they arrive. */
export function draftingChapters(chapters: MyWorkChapter[]): MyWorkChapter[] {
  return chapters.filter(
    c =>
      c.ownershipState === 'mine' &&
      (c.workflowStage === 'draft' || c.workflowStage === 'not_started'),
  );
}

/** Drafting chapters with something recorded, the one worked on last first. */
export function startedChapters(chapters: MyWorkChapter[]): MyWorkChapter[] {
  const activity = (c: MyWorkChapter) =>
    c.lastActivityAt ? Date.parse(c.lastActivityAt) || 0 : 0;
  return draftingChapters(chapters)
    .filter(c => c.completedVerses > 0)
    .sort((a, b) => activity(b) - activity(a));
}

/**
 * Home's "Next up": the one passage to record now, then the few after it.
 * The hero keeps going on a part-recorded passage in the chapter I worked on
 * last; otherwise it's the first unrecorded passage in book order. The rest
 * are always the first unrecorded passages in book order, so they can come
 * before a keep-going hero. Reloads on focus, so a passage recorded on the
 * player moves on when I come back.
 */
export function useNextUp(chapters: MyWorkChapter[]): NextUp {
  const [nextUp, setNextUp] = useState<NextUp>({ status: 'loading' });
  const readyWithDrafts = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const hasDrafts = draftingChapters(chapters).length > 0;
      // Chapters arrive after a first empty pass; don't show its empty state.
      if (hasDrafts && !readyWithDrafts.current) {
        setNextUp(prev =>
          prev.status === 'loading' ? prev : { status: 'loading' },
        );
      }
      const ready = (result: {
        hero: NextPassage | null;
        after: NextPassage[];
      }) => {
        readyWithDrafts.current = hasDrafts;
        setNextUp({ status: 'ready', ...result });
      };
      const pericopeSets = new Map<number, Promise<number | null>>();
      const coverages = new Map<number, CoveragesFor>();
      const loaded = new Map<number, Promise<BookPassage[]>>();

      const passagesOf = (chapter: MyWorkChapter) => {
        const cached = loaded.get(chapter.id);
        if (cached) return cached;
        const pericopeSetId =
          pericopeSets.get(chapter.projectId) ??
          getProjectPericopeSetId(chapter.projectId);
        pericopeSets.set(chapter.projectId, pericopeSetId);
        const coveragesFor =
          coverages.get(chapter.projectUnitId) ??
          coverageLookup(chapter.projectUnitId);
        coverages.set(chapter.projectUnitId, coveragesFor);
        const passages = pericopeSetId
          .then(setId => loadChapterPassages(chapter, setId, coveragesFor))
          .catch(error => {
            log.error('Failed to load passages', { error });
            return [wholeChapter(chapter)];
          });
        loaded.set(chapter.id, passages);
        return passages;
      };
      const entry = (chapter: MyWorkChapter, passage: BookPassage) => ({
        key: `${chapter.id}:${passage.key}`,
        chapter,
        passage,
      });

      (async () => {
        let hero: NextPassage | null = null;
        for (const chapter of startedChapters(chapters)) {
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
    }, [chapters]),
  );

  return nextUp;
}
