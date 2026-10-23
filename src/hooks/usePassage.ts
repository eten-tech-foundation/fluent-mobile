import { useCallback, useEffect, useState } from 'react';
import {
  getBibleTextId,
  getBibleTexts,
  getChapterAssignmentById,
  getPericopeForVerse,
  getSelectedTakeCoverages,
} from '../db/queries';
import { getTakesForVerse } from '../db/recordingsRepository';
import { getProjectPericopeSetId } from '../db/repository';
import { syncBibleTexts } from '../services/sync';
import type { BibleUnitVerse } from '../utils/bibleTabUnits';
import {
  buildBibleUnits,
  unitRecordedStatus,
  type BibleUnitRecordedStatus,
} from '../utils/bibleTabUnits';
import { logger } from '../utils/logger';

const log = logger.create('usePassage');

export interface PassageVerse extends BibleUnitVerse {
  text: string;
}

export interface PassageTake {
  id: string;
  takeNumber: number;
  /** The take drafting plays and uploads for this passage. */
  selected: boolean;
  /** ISO time it was recorded. */
  recordedAt: string;
}

export type Passage =
  | { status: 'loading' }
  | { status: 'missing' }
  | {
      status: 'ready';
      /** Pericope title; null when the set has none, or for a whole chapter. */
      title: string | null;
      /** e.g. "Mark 14:22–25". */
      reference: string;
      verses: PassageVerse[];
      /** The passage text is on the device. */
      downloaded: boolean;
      recordedStatus: BibleUnitRecordedStatus;
      /** Takes of the whole passage, oldest first. Verse takes aren't listed. */
      takes: PassageTake[];
    };

export type PassageDownload = 'idle' | 'downloading' | 'failed';

type Assignment = NonNullable<
  Awaited<ReturnType<typeof getChapterAssignmentById>>
>;

async function loadPassage(
  assignment: Assignment,
  anchorVerse: number,
  projectUnitId: number,
): Promise<Passage> {
  const { bibleId, bookId, chapterNumber, projectId } = assignment;
  const bookName = assignment.bookName ?? '';
  const chapterName = `${bookName} ${chapterNumber}`.trim();
  const pericopeSetId =
    projectId === null ? null : await getProjectPericopeSetId(projectId);
  const group =
    pericopeSetId === null
      ? null
      : await getPericopeForVerse(
          bookId,
          chapterNumber,
          anchorVerse,
          pericopeSetId,
        );

  const chapters = group
    ? Array.from(new Set(group.verses.map(v => v.chapterNumber)))
    : [chapterNumber];
  const texts = (
    await Promise.all(chapters.map(c => getBibleTexts(bibleId, bookId, c)))
  ).flat();
  const textOf = new Map(
    texts.map(t => [`${t.chapterNumber}:${t.verseNumber}`, t.text]),
  );
  const unitVerses: BibleUnitVerse[] =
    group?.verses ??
    texts.map(t => ({
      chapterNumber: t.chapterNumber,
      verseNumber: t.verseNumber,
    }));
  const verses = unitVerses.map(v => ({
    ...v,
    text: textOf.get(`${v.chapterNumber}:${v.verseNumber}`) ?? '',
  }));

  const reference = group
    ? buildBibleUnits({
        draftingUnit: 'pericope',
        verses: [],
        pericopes: [group],
        chapterNumber,
        chapterName,
        bookName,
      })[0]?.title ?? chapterName
    : chapterName;

  const coverages = await getSelectedTakeCoverages(
    bibleId,
    bookId,
    projectUnitId,
  );
  const first = unitVerses[0];
  const last = unitVerses[unitVerses.length - 1];
  const anchorId =
    group && first
      ? await getBibleTextId(
          bibleId,
          bookId,
          first.chapterNumber,
          first.verseNumber,
        )
      : null;
  const takes =
    anchorId === null || !first || !last
      ? []
      : (
          await getTakesForVerse(
            anchorId,
            undefined,
            {
              chapterNumber: first.chapterNumber,
              verseNumber: first.verseNumber,
            },
            projectUnitId,
          )
        )
          .filter(
            r =>
              r.granularity === 'pericope' &&
              r.startChapter === first.chapterNumber &&
              r.startVerse === first.verseNumber &&
              r.endChapter === last.chapterNumber &&
              r.endVerse === last.verseNumber,
          )
          .map(r => ({
            id: r.id,
            takeNumber: r.takeNumber,
            selected: r.isSelected,
            recordedAt: r.createdAt,
          }));

  return {
    status: 'ready',
    title: group?.pericopeTitle?.trim() || null,
    reference,
    verses,
    downloaded: verses.some(v => v.text !== ''),
    recordedStatus: unitRecordedStatus(unitVerses, coverages),
    takes,
  };
}

/**
 * One passage for the Next passage page: its text, how much is recorded and
 * its takes, read from the local DB, plus a download for its chapter's text
 * when it isn't on the device yet. Without a pericope set it's the chapter.
 */
export function usePassage(
  chapterAssignmentId: number,
  anchorVerse: number,
  projectUnitId: number,
): {
  passage: Passage;
  download: () => void;
  downloadState: PassageDownload;
  reload: () => void;
} {
  const [passage, setPassage] = useState<Passage>({ status: 'loading' });
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [downloadState, setDownloadState] = useState<PassageDownload>('idle');
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await getChapterAssignmentById(chapterAssignmentId);
      if (!found) return { found, next: { status: 'missing' } as const };
      return {
        found,
        next: await loadPassage(found, anchorVerse, projectUnitId),
      };
    })()
      .then(({ found, next }) => {
        if (cancelled) return;
        setAssignment(found);
        setPassage(next);
      })
      .catch(error => {
        log.error('Failed to load passage', { error });
        if (!cancelled) setPassage({ status: 'missing' });
      });
    return () => {
      cancelled = true;
    };
  }, [chapterAssignmentId, anchorVerse, projectUnitId, epoch]);

  const reload = useCallback(() => setEpoch(e => e + 1), []);

  const download = useCallback(() => {
    if (!assignment || downloadState === 'downloading') return;
    const { bibleId, bookId, chapterNumber } = assignment;
    setDownloadState('downloading');
    syncBibleTexts(undefined, {
      chapterGroups: new Map([[bibleId, [{ bookId, chapterNumber }]]]),
    })
      .then(() => loadPassage(assignment, anchorVerse, projectUnitId))
      .then(next => {
        setPassage(next);
        setDownloadState(
          next.status === 'ready' && next.downloaded ? 'idle' : 'failed',
        );
      })
      .catch(error => {
        log.warn('Passage download failed', { error });
        setDownloadState('failed');
      });
  }, [assignment, anchorVerse, projectUnitId, downloadState]);

  return { passage, download, downloadState, reload };
}
