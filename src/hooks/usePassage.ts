import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getBibleTextId,
  getBibleTexts,
  getChapterAssignmentById,
  getChapterAssignmentVerseCount,
  getPericopeForVerse,
  getSelectedTakeCoverages,
  hasPendingStageAdvance,
} from '../db/queries';
import { getTakesForVerse } from '../db/recordingsRepository';
import { getProjectPericopeSetId } from '../db/repository';
import {
  ensureSourceLanguageIso,
  releaseSourceLanguageIsoEnsure,
  syncBibleTexts,
} from '../services/sync';
import { onSyncComplete } from '../services/syncEvents';
import type { DraftingUnit } from '../services/draftingUnitPreference';
import { useConnectivity } from './useConnectivity';
import { useDraftingUnit } from './useDraftingUnit';
import type { BibleUnitVerse } from '../utils/bibleTabUnits';
import {
  buildBibleUnits,
  unitRecordedStatus,
  type BibleUnitRecordedStatus,
} from '../utils/bibleTabUnits';
import { logger } from '../utils/logger';
import { rangeCoversVerse } from '../utils/recordingRange';

const log = logger.create('usePassage');

export interface PassageVerse extends BibleUnitVerse {
  text: string;
  /** A selected take of mine covers it: its own take, or a passage take. */
  recorded: 'verse' | 'passage' | null;
}

export interface PassageTake {
  id: string;
  takeNumber: number;
  /** The take drafting plays and uploads for this passage. */
  selected: boolean;
  /** ISO time it was recorded. */
  recordedAt: string;
}

type Assignment = NonNullable<
  Awaited<ReturnType<typeof getChapterAssignmentById>>
>;

export type Passage =
  | { status: 'loading' }
  | { status: 'missing' }
  | {
      status: 'ready';
      /** Pericope title; null when the set has none, or for a whole chapter. */
      title: string | null;
      /** No pericope here, so the passage is the whole chapter. */
      wholeChapter: boolean;
      /** e.g. "Mark 14:22–25". */
      reference: string;
      verses: PassageVerse[];
      /** The passage text is on the device. */
      downloaded: boolean;
      recordedStatus: BibleUnitRecordedStatus;
      /** Takes of the whole passage, oldest first. Verse takes aren't listed. */
      takes: PassageTake[];
      /** The chapter it's recorded under, for the shared record session. */
      assignment: Assignment;
      /** Verses in that chapter, so recording knows when the text is in. */
      chapterVerseCount: number;
      /** The chapter was sent on here and the send hasn't reached the server. */
      waitingToSend: boolean;
    };

export type PassageDownload = 'idle' | 'downloading' | 'failed';

const LOADING: Passage = { status: 'loading' };

async function loadPassage(
  assignment: Assignment,
  anchorVerse: number,
  projectUnitId: number,
  unit: DraftingUnit,
): Promise<Passage> {
  const { bibleId, bookId, chapterNumber, projectId } = assignment;
  const bookName = assignment.bookName ?? '';
  const chapterName = `${bookName} ${chapterNumber}`.trim();
  // Verse by verse works through the whole chapter, as Legacy does.
  const pericopeSetId =
    projectId === null || unit === 'verse'
      ? null
      : await getProjectPericopeSetId(projectId);
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
  const expectedVerses = group
    ? group.verses.length
    : await getChapterAssignmentVerseCount(assignment.id);
  const downloaded =
    expectedVerses > 0 &&
    unitVerses.length >= expectedVerses &&
    unitVerses.every(v => textOf.get(`${v.chapterNumber}:${v.verseNumber}`));

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
  const verses: PassageVerse[] = unitVerses.map(v => {
    const cover = coverages.find(range =>
      rangeCoversVerse(range, v.chapterNumber, v.verseNumber),
    );
    return {
      ...v,
      text: textOf.get(`${v.chapterNumber}:${v.verseNumber}`) ?? '',
      recorded: !cover
        ? null
        : cover.granularity === 'pericope'
        ? 'passage'
        : 'verse',
    };
  });
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
    wholeChapter: group === null,
    reference,
    verses,
    downloaded,
    recordedStatus: unitRecordedStatus(unitVerses, coverages),
    takes,
    assignment,
    chapterVerseCount: texts.filter(t => t.chapterNumber === chapterNumber)
      .length,
    waitingToSend: await hasPendingStageAdvance(assignment.id),
  };
}

/**
 * One passage for the Next passage page: its text, how much is recorded and
 * its takes, read from the local DB, plus a download for its chapter's text
 * when it isn't on the device yet. Without a pericope set, or verse by
 * verse, it's the chapter.
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
  const { draftingUnit } = useDraftingUnit();
  // Tagged with the unit it was loaded under, so a switch doesn't show the
  // old passage.
  const [loaded, setLoaded] = useState<{
    passage: Passage;
    unit: DraftingUnit;
  }>({ passage: LOADING, unit: draftingUnit });
  const passage = loaded.unit === draftingUnit ? loaded.passage : LOADING;
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [downloadState, setDownloadState] = useState<PassageDownload>('idle');
  const [epoch, setEpoch] = useState(0);
  const sawFocus = useRef(false);
  const showedReady = useRef(false);
  const loadedKey = useRef('');

  useEffect(() => {
    return onSyncComplete(() => setEpoch(value => value + 1));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!sawFocus.current) {
        sawFocus.current = true;
        return;
      }
      setEpoch(value => value + 1);
    }, []),
  );

  useEffect(() => {
    const key = `${chapterAssignmentId}:${anchorVerse}:${projectUnitId}:${draftingUnit}`;
    if (loadedKey.current !== key) {
      loadedKey.current = key;
      showedReady.current = false;
    }
    let cancelled = false;
    (async () => {
      const found = await getChapterAssignmentById(chapterAssignmentId);
      if (!found) return { found, next: { status: 'missing' } as const };
      return {
        found,
        next: await loadPassage(
          found,
          anchorVerse,
          projectUnitId,
          draftingUnit,
        ),
      };
    })()
      .then(({ found, next }) => {
        if (cancelled) return;
        if (next.status === 'ready') showedReady.current = true;
        setAssignment(found);
        setLoaded({ passage: next, unit: draftingUnit });
      })
      .catch(error => {
        log.error('Failed to load passage', { error });
        if (!cancelled && !showedReady.current) {
          setLoaded({ passage: { status: 'missing' }, unit: draftingUnit });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chapterAssignmentId, anchorVerse, projectUnitId, epoch, draftingUnit]);

  const reload = useCallback(() => setEpoch(e => e + 1), []);

  const download = useCallback(() => {
    if (!assignment || downloadState === 'downloading') return;
    const { bibleId, bookId, chapterNumber } = assignment;
    const requested =
      passage.status === 'ready'
        ? Array.from(new Set(passage.verses.map(verse => verse.chapterNumber)))
        : [chapterNumber];
    const chapters = requested.length > 0 ? requested : [chapterNumber];
    setDownloadState('downloading');
    syncBibleTexts(undefined, {
      chapterGroups: new Map([
        [
          bibleId,
          chapters.map(chapter => ({ bookId, chapterNumber: chapter })),
        ],
      ]),
    })
      .then(() =>
        loadPassage(assignment, anchorVerse, projectUnitId, draftingUnit),
      )
      .then(next => {
        // A switch while it downloaded has loaded the other unit already.
        setLoaded(current =>
          current.unit === draftingUnit
            ? { passage: next, unit: draftingUnit }
            : current,
        );
        setDownloadState(
          next.status === 'ready' && next.downloaded ? 'idle' : 'failed',
        );
      })
      .catch(error => {
        log.warn('Passage download failed', { error });
        setDownloadState('failed');
      });
  }, [
    assignment,
    passage,
    anchorVerse,
    projectUnitId,
    downloadState,
    draftingUnit,
  ]);

  const { isOnline, hasResolved } = useConnectivity();
  const online = hasResolved && isOnline;

  // Repair a blank source-language code on open, so Listen can find source
  // audio.
  const projectId = assignment?.projectId ?? null;
  const missingIso =
    assignment !== null && !assignment.sourceLanguageCode?.trim();
  useEffect(() => {
    if (!missingIso || projectId === null || !online) return;
    let cancelled = false;
    void ensureSourceLanguageIso(
      projectId,
      async () =>
        (await getChapterAssignmentById(chapterAssignmentId))
          ?.sourceLanguageCode,
    ).then(pulled => {
      if (pulled && !cancelled) reload();
    });
    return () => {
      cancelled = true;
    };
  }, [missingIso, projectId, online, chapterAssignmentId, reload]);

  useEffect(() => {
    return () => {
      if (projectId !== null) releaseSourceLanguageIsoEnsure(projectId);
    };
  }, [projectId]);

  // And fetch the text once when it isn't here, rather than waiting on the
  // Download button, which stays as the retry.
  const autoDownloadedFor = useRef<number | null>(null);
  const needsText = passage.status === 'ready' && !passage.downloaded;
  useEffect(() => {
    if (!needsText || !online || downloadState !== 'idle') return;
    if (autoDownloadedFor.current === chapterAssignmentId) return;
    autoDownloadedFor.current = chapterAssignmentId;
    download();
  }, [needsText, online, downloadState, chapterAssignmentId, download]);

  return { passage, download, downloadState, reload };
}
