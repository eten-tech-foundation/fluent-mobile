import { ChapterAssignmentData, VerseData } from '../../types/db/types';
import React, { createContext, useContext, useMemo, useState } from 'react';

interface DraftingContextValue {
  /** The verse the translator is currently working on. */
  selectedVerse: number;
  /**
   * Changes the selected verse. Only call this from explicit user actions
   * (tapping a verse on the Bible Tab, or prev/next on the Record Tab).
   * Passive audio playback must NOT call this.
   */
  setSelectedVerse: (verseNumber: number) => void;
  verses: VerseData[];
  chapterAssignment: ChapterAssignmentData;
  /** Book name for verse references (falls back to route chapter name). */
  bookDisplayName: string;
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
    }),
    [selectedVerse, verses, chapterAssignment, bookDisplayName],
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
