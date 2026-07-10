import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { DraftingProvider, useDraftingContext } from './DraftingContext';
import type { ChapterAssignmentData, VerseData } from '../../types/db/types';

const VERSES: VerseData[] = [
  { bibleId: 1, bookId: 41, chapterNumber: 14, verseNumber: 1, text: 'v1' },
  { bibleId: 1, bookId: 41, chapterNumber: 14, verseNumber: 5, text: 'v5' },
  { bibleId: 1, bookId: 41, chapterNumber: 14, verseNumber: 9, text: 'v9' },
];

const CHAPTER: ChapterAssignmentData = {
  id: 88,
  projectUnitId: 7,
  bibleId: 1,
  bookId: 41,
  chapterNumber: 14,
  status: 'in_progress',
};

let selectedFromContext = -1;

function Probe() {
  const { selectedVerse } = useDraftingContext();
  selectedFromContext = selectedVerse;
  return <Text>{`verse:${selectedVerse}`}</Text>;
}

function renderProvider(initialVerse: number) {
  return render(
    <DraftingProvider
      verses={VERSES}
      initialVerse={initialVerse}
      chapterAssignment={CHAPTER}
      bookDisplayName="Mark"
    >
      <Probe />
    </DraftingProvider>,
  );
}

describe('DraftingProvider', () => {
  it('exposes the initial verse as the selected verse', () => {
    renderProvider(5);
    expect(screen.getByText('verse:5')).toBeTruthy();
  });

  it('re-points the selected verse when initialVerse changes', () => {
    const { rerender } = renderProvider(1);
    expect(screen.getByText('verse:1')).toBeTruthy();

    act(() => {
      rerender(
        <DraftingProvider
          verses={VERSES}
          initialVerse={9}
          chapterAssignment={CHAPTER}
          bookDisplayName="Mark"
        >
          <Probe />
        </DraftingProvider>,
      );
    });

    expect(screen.getByText('verse:9')).toBeTruthy();
    expect(selectedFromContext).toBe(9);
  });
});
