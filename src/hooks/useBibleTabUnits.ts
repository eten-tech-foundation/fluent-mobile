import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProjectPericopeSetId } from '../db/repository';
import {
  getBibleTexts,
  getPericopesForChapter,
  getSelectedTakeCoverages,
} from '../db/queries';
import type { VerseData } from '../types/db/types';
import { useDraftingUnit } from './useDraftingUnit';
import {
  buildBibleUnits,
  formatSourceAudioUnitCaption,
  lastUnrecordedAnchorVerse,
  unitContainsVerse,
  unitRecordedStatus,
  type BibleUnit,
  type BibleUnitRecordedStatus,
} from '../utils/bibleTabUnits';
import type { RecordingVerseRange } from '../utils/recordingRange';

export type BibleTabUnitView = BibleUnit & {
  recordedStatus: BibleUnitRecordedStatus;
};

export function useBibleTabUnits(args: {
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  projectId: number | null;
  verses: VerseData[];
  chapterName: string;
  bookName: string;
  selectedVerse: number;
  coverageEpoch?: number;
}) {
  const { draftingUnit } = useDraftingUnit();
  const [pericopeSetId, setPericopeSetId] = useState<number | null>(null);
  const [pericopeSetResolved, setPericopeSetResolved] = useState(
    args.projectId === null,
  );
  const [pericopes, setPericopes] = useState<
    Parameters<typeof buildBibleUnits>[0]['pericopes']
  >([]);
  const [pericopesResolved, setPericopesResolved] = useState(
    draftingUnit !== 'pericope',
  );
  const [crossChapterVerseTexts, setCrossChapterVerseTexts] = useState<
    Map<string, string>
  >(new Map());
  const crossChapterTextRequestIdRef = useRef(0);
  const [coverages, setCoverages] = useState<RecordingVerseRange[]>([]);
  const [coveragesResolved, setCoveragesResolved] = useState(false);
  const pericopeRequestIdRef = useRef(0);
  const coverageRequestIdRef = useRef(0);

  useEffect(() => {
    if (args.projectId === null) {
      setPericopeSetId(null);
      setPericopeSetResolved(true);
      return;
    }
    setPericopeSetResolved(false);
    let cancelled = false;
    void getProjectPericopeSetId(args.projectId).then(id => {
      if (!cancelled) {
        setPericopeSetId(id);
        setPericopeSetResolved(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [args.projectId]);

  useEffect(() => {
    const requestId = ++pericopeRequestIdRef.current;
    setPericopes(current => (current.length === 0 ? current : []));
    if (draftingUnit !== 'pericope') {
      setPericopesResolved(true);
      return;
    }
    if (!pericopeSetResolved) {
      setPericopesResolved(false);
      return;
    }
    if (pericopeSetId === null) {
      setPericopesResolved(true);
      return;
    }
    setPericopesResolved(false);
    let cancelled = false;
    void getPericopesForChapter(
      args.bookId,
      args.chapterNumber,
      pericopeSetId,
    ).then(groups => {
      if (cancelled || requestId !== pericopeRequestIdRef.current) {
        return;
      }
      setPericopes(groups);
      setPericopesResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    draftingUnit,
    pericopeSetId,
    pericopeSetResolved,
    args.bookId,
    args.chapterNumber,
  ]);

  useEffect(() => {
    const requestId = ++crossChapterTextRequestIdRef.current;
    const otherChapters = Array.from(
      new Set(
        pericopes
          .flatMap(p => p.verses)
          .map(v => v.chapterNumber)
          .filter(chapterNumber => chapterNumber !== args.chapterNumber),
      ),
    );

    if (otherChapters.length === 0) {
      setCrossChapterVerseTexts(new Map());
      return;
    }

    void Promise.all(
      otherChapters.map(chapterNumber =>
        getBibleTexts(args.bibleId, args.bookId, chapterNumber),
      ),
    ).then(results => {
      if (requestId !== crossChapterTextRequestIdRef.current) {
        return;
      }
      const map = new Map<string, string>();
      for (const chapterVerses of results) {
        for (const v of chapterVerses) {
          map.set(`${v.chapterNumber}:${v.verseNumber}`, v.text);
        }
      }
      setCrossChapterVerseTexts(map);
    });
  }, [pericopes, args.bibleId, args.bookId, args.chapterNumber]);

  const refreshCoverages = useCallback(() => {
    const requestId = ++coverageRequestIdRef.current;
    void getSelectedTakeCoverages(args.bibleId, args.bookId).then(rows => {
      if (requestId !== coverageRequestIdRef.current) {
        return;
      }
      setCoverages(rows);
      setCoveragesResolved(true);
    });
  }, [args.bibleId, args.bookId]);

  useEffect(() => {
    setCoveragesResolved(false);
  }, [args.bibleId, args.bookId]);

  useEffect(() => {
    refreshCoverages();
  }, [refreshCoverages, args.coverageEpoch]);

  const pericopeModePending =
    draftingUnit === 'pericope' && (!pericopeSetResolved || !pericopesResolved);
  const unitsPending = !coveragesResolved || pericopeModePending;
  const effectiveUnit =
    draftingUnit === 'pericope' && (pericopes.length > 0 || pericopeModePending)
      ? 'pericope'
      : 'verse';

  const units = useMemo(
    () =>
      buildBibleUnits({
        draftingUnit: effectiveUnit,
        verses: args.verses,
        pericopes,
        chapterNumber: args.chapterNumber,
        chapterName: args.chapterName,
        bookName: args.bookName,
        crossChapterVerseTexts,
      }),
    [
      effectiveUnit,
      args.verses,
      pericopes,
      args.chapterNumber,
      args.chapterName,
      args.bookName,
      crossChapterVerseTexts,
    ],
  );

  const unitViews: BibleTabUnitView[] = useMemo(
    () =>
      units.map(unit => ({
        ...unit,
        recordedStatus: unitRecordedStatus(unit.verses, coverages),
      })),
    [units, coverages],
  );

  const activeIndex = Math.max(
    0,
    units.findIndex(unit =>
      unitContainsVerse(unit, args.chapterNumber, args.selectedVerse),
    ),
  );

  const unitCaption = formatSourceAudioUnitCaption({
    draftingUnit: effectiveUnit,
    index: effectiveUnit === 'verse' ? args.selectedVerse : activeIndex + 1,
    total: effectiveUnit === 'verse' ? args.verses.length : units.length,
  });

  const lastUnrecorded = lastUnrecordedAnchorVerse(units, coverages);

  const boundaryVerses =
    effectiveUnit === 'pericope'
      ? units[activeIndex]?.verses
          .filter(v => v.chapterNumber === args.chapterNumber)
          .slice(1)
          .map(v => v.verseNumber) ?? []
      : [];

  return {
    draftingUnit,
    effectiveUnit,
    unitsPending,
    units: unitViews,
    activeIndex,
    unitCaption,
    lastUnrecorded,
    boundaryVerses,
    refreshCoverages,
  };
}
