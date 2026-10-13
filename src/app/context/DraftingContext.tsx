import { logger } from '../../utils/logger';
import { VerseData } from '../../types/db/types';
import { getRecordedVerseNumbers } from '../../db/queries';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const log = logger.create('DraftingContext');

interface DraftingContextValue {
  selectedVerse: number;
  setSelectedVerse: (verseNumber: number) => void;
  verses: VerseData[];
  projectId: number | null;
  /** Chapter's project unit; scopes recorded-status queries (#613). */
  projectUnitId: number | null;
  bookName: string;
  chapterName: string;
  /**
   * The verse whose source audio is currently playing, tracked
   * independently of `selectedVerse`. Not wired to real audio yet —
   * present so BibleTab's playing-row highlight and the player bar
   * don't need reshaping once playback lands.
   */
  currentlyPlayingVerse: number | null;
  setCurrentlyPlayingVerse: (verseNumber: number | null) => void;
  /** Verse numbers with a current take for the active user (#47 waveform icon). */
  recordedVerseNumbers: Set<number>;
  /**
   * Bumps on every recorded-verse refresh so coverage queries rerun even when
   * the recorded-anchor count stays the same (replaced take / changed range).
   */
  recordedCoverageEpoch: number;
  /** Call after a take is added/deleted so the waveform icon reflects it. */
  refreshRecordedVerses: () => Promise<void>;
}

const DraftingContext = createContext<DraftingContextValue | undefined>(
  undefined,
);

interface DraftingProviderProps {
  children: React.ReactNode;
  verses: VerseData[];
  initialVerse: number;
  projectId?: number | null;
  projectUnitId?: number | null;
  bookName?: string;
  chapterName?: string;
  recoverVerse?: number;
  recoverSessionKey?: string;
}

export function DraftingProvider({
  children,
  verses,
  initialVerse,
  projectId = null,
  projectUnitId = null,
  bookName = '',
  chapterName = '',
  recoverVerse,
  recoverSessionKey,
}: DraftingProviderProps) {
  const [selectedVerse, setSelectedVerse] = useState<number>(initialVerse);
  const [currentlyPlayingVerse, setCurrentlyPlayingVerse] = useState<
    number | null
  >(null);
  const [recordedVerseNumbers, setRecordedVerseNumbers] = useState<Set<number>>(
    new Set(),
  );
  const [recordedCoverageEpoch, setRecordedCoverageEpoch] = useState(0);
  const recordedVersesRequestIdRef = useRef(0);

  const chapterKey = verses[0]
    ? `${verses[0].bibleId}:${verses[0].bookId}:${verses[0].chapterNumber}`
    : null;

  const refreshRecordedVerses = React.useCallback(async () => {
    const requestId = ++recordedVersesRequestIdRef.current;
    const first = verses[0];
    if (!first) {
      if (requestId === recordedVersesRequestIdRef.current) {
        setRecordedVerseNumbers(new Set());
        setRecordedCoverageEpoch(n => n + 1);
      }
      return;
    }
    try {
      const nums = await getRecordedVerseNumbers(
        first.bibleId,
        first.bookId,
        first.chapterNumber,
        projectUnitId,
      );
      if (requestId !== recordedVersesRequestIdRef.current) {
        return;
      }
      setRecordedVerseNumbers(nums);
      setRecordedCoverageEpoch(n => n + 1);
    } catch (error) {
      if (requestId !== recordedVersesRequestIdRef.current) {
        return;
      }
      log.error('Failed to load recorded verse numbers', { error });
    }
  }, [verses, projectUnitId]);

  useEffect(() => {
    refreshRecordedVerses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterKey, projectUnitId]);

  const versesRef = useRef(verses);
  versesRef.current = verses;

  // Resume can land on an already-mounted verse-detail with new params;
  // useState(initialVerse) only seeds once, so apply the recover target here.
  useEffect(() => {
    if (recoverVerse === undefined) return;
    if (!versesRef.current.some(v => v.verseNumber === recoverVerse)) return;
    setSelectedVerse(recoverVerse);
  }, [recoverVerse, recoverSessionKey]);

  const value = useMemo(
    () => ({
      selectedVerse,
      setSelectedVerse,
      verses,
      projectId,
      projectUnitId,
      bookName,
      chapterName,
      currentlyPlayingVerse,
      setCurrentlyPlayingVerse,
      recordedVerseNumbers,
      recordedCoverageEpoch,
      refreshRecordedVerses,
    }),
    [
      selectedVerse,
      verses,
      projectId,
      projectUnitId,
      bookName,
      chapterName,
      currentlyPlayingVerse,
      recordedVerseNumbers,
      recordedCoverageEpoch,
      refreshRecordedVerses,
    ],
  );

  return (
    <DraftingContext.Provider value={value}>
      {children}
    </DraftingContext.Provider>
  );
}

export function useDraftingContext(): DraftingContextValue {
  const ctx = useContext(DraftingContext);
  if (!ctx) {
    throw new Error(
      'useDraftingContext must be used within a DraftingProvider',
    );
  }
  return ctx;
}
