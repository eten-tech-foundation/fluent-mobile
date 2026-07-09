import { VerseData } from '../../types/db/types';
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

  const value = useMemo(
    () => ({ selectedVerse, setSelectedVerse, verses }),
    [selectedVerse, verses],
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
