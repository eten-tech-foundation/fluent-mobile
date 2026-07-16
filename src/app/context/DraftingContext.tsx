import { ChapterAssignmentData, VerseData } from '../../types/db/types';
import React, { createContext, useContext, useMemo, useState } from 'react';

interface DraftingContextValue {
  selectedVerse: number;

  setSelectedVerse: (verseNumber: number) => void;
  verses: VerseData[];
  chapterAssignment: ChapterAssignmentData;
  /** Book name for verse references (falls back to route chapter name). */
  bookDisplayName: string;
  /**
   * The verse whose source audio is currently playing, tracked
   * independently of `selectedVerse`. Not wired to real audio yet —
   * present so BibleTab's playing-row highlight and the player bar
   * don't need reshaping once playback lands.
   */
  currentlyPlayingVerse: number | null;
  setCurrentlyPlayingVerse: (verseNumber: number | null) => void;
}

const DraftingContext = createContext<DraftingContextValue | undefined>(
  undefined,
);

interface DraftingProviderProps {
  children: React.ReactNode;
  verses: VerseData[];
  initialVerse: number;
  chapterAssignment: ChapterAssignmentData;
  bookDisplayName: string;
}

export function DraftingProvider({
  children,
  verses,
  initialVerse,
  chapterAssignment,
  bookDisplayName,
}: DraftingProviderProps) {
  const [selectedVerse, setSelectedVerse] = useState<number>(initialVerse);
  const [currentlyPlayingVerse, setCurrentlyPlayingVerse] = useState<
    number | null
  >(null);

  // Re-point the selection when the screen hands us a new target verse (e.g. a
  // recovery navigation, or a chapter reload with a new default). Without this
  // the selection would stay frozen at the first mount's value if the provider
  // is kept mounted across an initialVerse change.
  const [prevInitialVerse, setPrevInitialVerse] = useState(initialVerse);
  if (initialVerse !== prevInitialVerse) {
    setPrevInitialVerse(initialVerse);
    setSelectedVerse(initialVerse);
  }

  const value = useMemo(
    () => ({
      selectedVerse,
      setSelectedVerse,
      verses,
      chapterAssignment,
      bookDisplayName,
      currentlyPlayingVerse,
      setCurrentlyPlayingVerse,
    }),
    [
      selectedVerse,
      verses,
      chapterAssignment,
      bookDisplayName,
      currentlyPlayingVerse,
      setSelectedVerse,
      setCurrentlyPlayingVerse,
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
