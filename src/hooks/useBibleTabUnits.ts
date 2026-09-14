import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProjectPericopeSetId } from '../db/repository';
import {
  getPericopesForChapter,
  getSelectedTakeCoverages,
} from '../db/queries';
import type { VerseData } from '../types/db/types';
import { useDraftingUnit } from './useDraftingUnit';
import {
  buildBibleUnits,
  formatSourceAudioUnitCaption,
  lastUnrecordedAnchorVerse,
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
  const [pericopes, setPericopes] = useState<
    Parameters<typeof buildBibleUnits>[0]['pericopes']
  >([]);
  const [coverages, setCoverages] = useState<RecordingVerseRange[]>([]);
  const pericopeRequestIdRef = useRef(0);
  const coverageRequestIdRef = useRef(0);

  useEffect(() => {
    if (args.projectId === null) {
      setPericopeSetId(null);
      return;
    }
    let cancelled = false;
    void getProjectPericopeSetId(args.projectId).then(id => {
      if (!cancelled) setPericopeSetId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [args.projectId]);

  useEffect(() => {
    const requestId = ++pericopeRequestIdRef.current;
    if (draftingUnit !== 'pericope' || pericopeSetId === null) {
      return;
    }
    void getPericopesForChapter(
      args.bookId,
      args.chapterNumber,
      pericopeSetId,
    ).then(groups => {
      if (requestId === pericopeRequestIdRef.current) {
        setPericopes(groups);
      }
    });
  }, [draftingUnit, pericopeSetId, args.bookId, args.chapterNumber]);

  const refreshCoverages = useCallback(() => {
    const requestId = ++coverageRequestIdRef.current;
    void getSelectedTakeCoverages(args.bibleId, args.bookId).then(rows => {
      if (requestId === coverageRequestIdRef.current) {
        setCoverages(rows);
      }
    });
  }, [args.bibleId, args.bookId]);

  useEffect(() => {
    refreshCoverages();
  }, [refreshCoverages, args.coverageEpoch]);

  const effectiveUnit =
    draftingUnit === 'pericope' && pericopes.length > 0 ? 'pericope' : 'verse';

  const units = useMemo(
    () =>
      buildBibleUnits({
        draftingUnit: effectiveUnit,
        verses: args.verses,
        pericopes,
        chapterNumber: args.chapterNumber,
        chapterName: args.chapterName,
        bookName: args.bookName,
      }),
    [
      effectiveUnit,
      args.verses,
      pericopes,
      args.chapterNumber,
      args.chapterName,
      args.bookName,
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
      unit.verses.some(
        verse =>
          verse.chapterNumber === args.chapterNumber &&
          verse.verseNumber === args.selectedVerse,
      ),
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
    units: unitViews,
    activeIndex,
    unitCaption,
    lastUnrecorded,
    boundaryVerses,
    refreshCoverages,
  };
}
