import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { TranslationNotesSection } from './TranslationNotesSection';
import { TRANSLATION_NOTES_LOAD_ERROR } from '../../../constants/messages';
import {
  loadTranslationNotesForUnit,
  setTranslationNotesLoadFailureForTests,
} from '../../../services/translationNotes';
import { TranslationNoteItem } from '../../../types/resources/translationNotes';
import { useTranslationNotesForUnit } from '../../../hooks/useTranslationNotesForUnit';

jest.mock('../../../services/translationNotes', () => {
  const actual = jest.requireActual('../../../services/translationNotes');
  return {
    ...actual,
    loadTranslationNotesForUnit: jest.fn(),
  };
});

const mockLoad = loadTranslationNotesForUnit as jest.MockedFunction<
  typeof loadTranslationNotesForUnit
>;

// Fixed fixtures for the verse numbers this suite exercises — no live mock
// generator, so this test has no dependency on `mocks/resources`.
const NOTES_FOR_VERSE_1: TranslationNoteItem[] = [
  {
    id: 'tn-99-1-1',
    title: 'connecting word',
    body: 'This phrase connects the current verse to the previous one.',
  },
  {
    id: 'tn-99-1-2',
    title: 'Important name',
    body: 'Translate this name consistently with earlier uses in the book.',
  },
];

function notesForVerse(verseNumber: number): TranslationNoteItem[] {
  return verseNumber === 3 ? [] : NOTES_FOR_VERSE_1;
}

function SectionHarness({
  verseNumber,
  sectionExpanded = true,
}: {
  verseNumber: number;
  sectionExpanded?: boolean;
}) {
  const { state, retry } = useTranslationNotesForUnit({
    projectId: 7,
    bookCode: 'MRK',
    chapterNumber: 14,
    verseNumber,
  });
  return (
    <TranslationNotesSection
      state={state}
      retry={retry}
      sectionExpanded={sectionExpanded}
      bookCode="MRK"
      chapterNumber={14}
      verseNumber={verseNumber}
    />
  );
}

describe('TranslationNotesSection', () => {
  beforeEach(() => {
    mockLoad.mockImplementation(async ({ verseNumber }) =>
      notesForVerse(verseNumber),
    );
  });

  afterEach(() => {
    setTranslationNotesLoadFailureForTests(false);
    mockLoad.mockReset();
  });

  it('hides content when no notes are available', async () => {
    render(<SectionHarness verseNumber={3} />);

    await waitFor(() => {
      expect(screen.queryByTestId('translation-notes-loading')).toBeNull();
    });
    expect(screen.queryByTestId('translation-notes-list')).toBeNull();
    expect(screen.queryByTestId('translation-notes-error')).toBeNull();
  });

  it('keeps note bodies hidden until a nested accordion is expanded', async () => {
    render(<SectionHarness verseNumber={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });

    expect(screen.getByText('connecting word')).toBeTruthy();
    expect(
      screen.queryByText(
        'This phrase connects the current verse to the previous one.',
      ),
    ).toBeNull();

    fireEvent.press(screen.getByTestId('translation-note-tn-99-1-1-toggle'));

    expect(
      screen.getByText(
        'This phrase connects the current verse to the previous one.',
      ),
    ).toBeTruthy();
  });

  it('shows section-scoped error and recovers on Retry', async () => {
    mockLoad.mockRejectedValueOnce(new Error('boom'));
    mockLoad.mockResolvedValueOnce(NOTES_FOR_VERSE_1);

    render(<SectionHarness verseNumber={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-error')).toBeTruthy();
    });
    expect(screen.getByText(TRANSLATION_NOTES_LOAD_ERROR)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('translation-notes-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });
  });

  it('treats a missing load state as loading instead of crashing', () => {
    render(
      <TranslationNotesSection
        state={undefined}
        retry={() => undefined}
        sectionExpanded
        bookCode="MRK"
        chapterNumber={14}
        verseNumber={1}
      />,
    );

    expect(screen.getByTestId('translation-notes-loading')).toBeTruthy();
  });
});
