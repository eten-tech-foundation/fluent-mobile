import { logger } from '../../utils/logger';
import { VerseData } from '../../types/db/types';
import { getRecordedVerseNumbersForChapter } from '../../db/repository';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const log = logger.create('DraftingContext');

interface DraftingContextValue {
  selectedVerse: number;

  setSelectedVerse: (verseNumber: number) => void;
  verses: VerseData[];
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
}

export function DraftingProvider({
  children,
  verses,
  initialVerse,
}: DraftingProviderProps) {
  const [selectedVerse, setSelectedVerse] = useState<number>(initialVerse);
  const [currentlyPlayingVerse, setCurrentlyPlayingVerse] = useState<
    number | null
  >(null);
  const [recordedVerseNumbers, setRecordedVerseNumbers] = useState<Set<number>>(
    new Set(),
  );

  const chapterKey = verses[0]
    ? `${verses[0].bibleId}:${verses[0].bookId}:${verses[0].chapterNumber}`
    : null;

  const refreshRecordedVerses = React.useCallback(async () => {
    const first = verses[0];
    if (!first) {
      setRecordedVerseNumbers(new Set());
      return;
    }
    try {
      const nums = await getRecordedVerseNumbersForChapter(
        first.bibleId,
        first.bookId,
        first.chapterNumber,
      );
      setRecordedVerseNumbers(new Set(nums));
    } catch (error) {
      log.error('Failed to load recorded verse numbers', { error });
    }
  }, [verses]);

  useEffect(() => {
    refreshRecordedVerses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterKey]);

  const value = useMemo(
    () => ({
      selectedVerse,
      setSelectedVerse,
      verses,
      currentlyPlayingVerse,
      setCurrentlyPlayingVerse,
      recordedVerseNumbers,
      refreshRecordedVerses,
    }),
    [
      selectedVerse,
      verses,
      currentlyPlayingVerse,
      recordedVerseNumbers,
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
