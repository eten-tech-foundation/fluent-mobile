import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { RecordTab } from './RecordTab';

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { chapterName: 'Mark 14' } }),
}));
import { DraftingProvider } from '../context/DraftingContext';

jest.mock('../../hooks/useVerseAudio', () => ({
  useVerseAudio: () => ({
    state: 'idle',
    latest: null,
    errorMessage: null,
    positionMs: 0,
    durationMs: 0,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(),
    play: jest.fn(),
    deleteCurrent: jest.fn(),
  }),
}));

jest.mock('../../db/queries', () => ({
  getBibleTextId: jest.fn(async () => 42),
}));

jest.mock('../../audio/micPermission', () => ({
  requestMicPermission: jest.fn(async () => 'granted'),
}));

const chapterData = {
  id: 1,
  bibleId: 1,
  bookId: 1,
  chapterNumber: 14,
  bibleName: 'Source',
  bookName: 'Mark',
} as never;

describe('RecordTab', () => {
  it('renders verse nav and record affordance', () => {
    render(
      <DraftingProvider
        verses={[
          {
            bibleId: 1,
            bookId: 1,
            chapterNumber: 14,
            verseNumber: 3,
            text: 'Source text',
          },
        ]}
        initialVerse={3}
      >
        <RecordTab chapterData={chapterData} />
      </DraftingProvider>,
    );

    expect(screen.getByTestId('record-tab')).toBeTruthy();
    expect(screen.getByTestId('record-verse-reference')).toBeTruthy();
    expect(screen.getByTestId('record-start-button')).toBeTruthy();
  });
});
