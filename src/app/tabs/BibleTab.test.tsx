import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BibleTab } from './BibleTab';
import { DraftingProvider } from '../context/DraftingContext';

const verses = [
  {
    bibleId: 1,
    bookId: 1,
    chapterNumber: 14,
    verseNumber: 2,
    text: 'Source text for verse 2',
  },
];

describe('BibleTab', () => {
  it('selects the verse and opens Record when a verse row is pressed', () => {
    const onOpenRecord = jest.fn();

    render(
      <DraftingProvider verses={verses} initialVerse={2}>
        <BibleTab onOpenRecord={onOpenRecord} />
      </DraftingProvider>,
    );

    fireEvent.press(screen.getByLabelText('Verse 2, selected'));
    expect(onOpenRecord).toHaveBeenCalledTimes(1);
  });
});
