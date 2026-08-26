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
import { getMockTranslationNotes } from '../../../mocks/resources/translationNotesMock';
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
      getMockTranslationNotes(99, verseNumber),
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
    mockLoad.mockResolvedValueOnce(getMockTranslationNotes(99, 1));

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
