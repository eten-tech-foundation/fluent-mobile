import React from 'react';
import { Button, View } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { ResourcesTab } from './ResourcesTab';
import {
  DraftingProvider,
  useDraftingContext,
} from '../context/DraftingContext';
import { RESOURCES_EMPTY_MESSAGE } from '../../constants/messages';
import { clearResourcesTabUiState } from '../../utils/resourcesTabUiState';
import { VerseData } from '../../types/db/types';
import { getMockTranslationQuestions } from '../../mocks/resources/translationQuestionsMock';
import {
  loadTranslationQuestionsForUnit,
  setTranslationQuestionsLoadFailureForTests,
} from '../../services/translationQuestions';
import {
  loadTranslationNotesForUnit,
  setTranslationNotesLoadFailureForTests,
} from '../../services/translationNotes';
import { getMockTranslationNotes } from '../../mocks/resources/translationNotesMock';

jest.mock('../../services/translationQuestions', () => {
  const actual = jest.requireActual('../../services/translationQuestions');
  return {
    ...actual,
    loadTranslationQuestionsForUnit: jest.fn(),
  };
});

jest.mock('../../services/translationNotes', () => {
  const actual = jest.requireActual('../../services/translationNotes');
  return {
    ...actual,
    loadTranslationNotesForUnit: jest.fn(),
  };
});

const mockLoadNotes = loadTranslationNotesForUnit as jest.MockedFunction<
  typeof loadTranslationNotesForUnit
>;
const mockLoadQuestions =
  loadTranslationQuestionsForUnit as jest.MockedFunction<
    typeof loadTranslationQuestionsForUnit
  >;

const verses: VerseData[] = [1, 2, 3].map(verseNumber => ({
  bibleId: 1,
  bookId: 41,
  chapterNumber: 14,
  verseNumber,
  text: `Text ${verseNumber}`,
}));

function VerseSwitcher() {
  const { selectedVerse, setSelectedVerse } = useDraftingContext();
  return (
    <View>
      <Button
        title={`current-${selectedVerse}`}
        testID="current-verse"
        onPress={() => undefined}
      />
      <Button
        title="select-1"
        testID="select-verse-1"
        onPress={() => setSelectedVerse(1)}
      />
      <Button
        title="select-2"
        testID="select-verse-2"
        onPress={() => setSelectedVerse(2)}
      />
      <Button
        title="select-3"
        testID="select-verse-3"
        onPress={() => setSelectedVerse(3)}
      />
    </View>
  );
}

function renderResources(initialVerse: number) {
  return render(
    <DraftingProvider verses={verses} initialVerse={initialVerse}>
      <VerseSwitcher />
      <ResourcesTab
        chapterId={99}
        chapterName="Mark 14"
        bookCode="MRK"
        chapterNumber={14}
      />
    </DraftingProvider>,
  );
}

describe('ResourcesTab', () => {
  beforeEach(() => {
    clearResourcesTabUiState();
    setTranslationQuestionsLoadFailureForTests(false);
    setTranslationNotesLoadFailureForTests(false);
    mockLoadNotes.mockImplementation(async ({ verseNumber }) =>
      getMockTranslationNotes(99, verseNumber),
    );
    mockLoadQuestions.mockImplementation(async ({ verseNumber }) =>
      getMockTranslationQuestions(99, verseNumber),
    );
  });

  afterEach(() => {
    setTranslationQuestionsLoadFailureForTests(false);
    setTranslationNotesLoadFailureForTests(false);
    mockLoadNotes.mockReset();
    mockLoadQuestions.mockReset();
  });

  it('shows the empty message when the unit has no resources', async () => {
    mockLoadNotes.mockResolvedValue([]);
    renderResources(3);
    await waitFor(() => {
      expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    });
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows live Translation Notes even when mock shell is empty', async () => {
    mockLoadNotes.mockResolvedValue(getMockTranslationNotes(99, 1));
    renderResources(3);

    await waitFor(() => {
      expect(screen.getByText('Translation Notes')).toBeTruthy();
    });
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText('Translation Questions')).toBeNull();
  });

  it('shows Translation Notes and Questions when items exist', async () => {
    renderResources(2);
    expect(screen.getByText('Mark 14:2')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();
    expect(screen.queryByText(RESOURCES_EMPTY_MESSAGE)).toBeNull();

    const notes = screen.getByTestId('resources-section-translationNotes');
    const questions = screen.getByTestId(
      'resources-section-translationQuestions',
    );
    expect(notes).toBeTruthy();
    expect(questions).toBeTruthy();

    fireEvent.press(
      screen.getByTestId('resources-section-translationNotes-toggle'),
    );
    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });
    expect(screen.getByText('connecting word')).toBeTruthy();
  });

  it('hides Translation Questions when none are available for the unit', () => {
    renderResources(1);
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText('Translation Questions')).toBeNull();
  });

  it('hides Translation Notes when Aquifer returns no notes', async () => {
    mockLoadNotes.mockResolvedValue([]);
    renderResources(1);

    await waitFor(() => {
      expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    });
    expect(
      screen.queryByTestId('resources-section-translationNotes'),
    ).toBeNull();
  });

  it('updates when the selected verse changes', async () => {
    renderResources(2);
    expect(screen.getByText('Translation Notes')).toBeTruthy();

    fireEvent.press(screen.getByTestId('select-verse-3'));
    await waitFor(() => {
      expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    });
    expect(screen.queryByText('Translation Notes')).toBeNull();

    fireEvent.press(screen.getByTestId('select-verse-1'));
    await waitFor(() => {
      expect(screen.getByText('Mark 14:1')).toBeTruthy();
      expect(screen.getByText('Translation Notes')).toBeTruthy();
    });
    expect(screen.queryByText('Translation Questions')).toBeNull();
  });

  it('restores open accordion state when returning to a unit', async () => {
    renderResources(2);

    fireEvent.press(
      screen.getByTestId('resources-section-translationNotes-toggle'),
    );
    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('select-verse-1'));
    await waitFor(() => {
      expect(screen.getByText('Mark 14:1')).toBeTruthy();
    });
    expect(screen.queryByTestId('translation-notes-list')).toBeNull();

    fireEvent.press(screen.getByTestId('select-verse-2'));
    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });
  });

  it('keeps Questions and Images visible when Notes load fails', async () => {
    mockLoadNotes.mockRejectedValue(new Error('boom'));
    renderResources(2);

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();

    fireEvent.press(
      screen.getByTestId('resources-section-translationNotes-toggle'),
    );

    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-error')).toBeTruthy();
    });

    expect(screen.getByText('Translation Questions')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();

    mockLoadNotes.mockResolvedValue(getMockTranslationNotes(99, 2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('translation-notes-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('translation-notes-list')).toBeTruthy();
    });
  });

  it('keeps TQ collapsed by default and reveals questions only after expand', async () => {
    renderResources(2);

    expect(screen.queryByTestId('translation-questions-list')).toBeNull();

    fireEvent.press(
      screen.getByTestId('resources-section-translationQuestions-toggle'),
    );

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
    });
    expect(screen.getByText('What is happening in this verse?')).toBeTruthy();
    expect(
      screen.queryByText(
        'The passage describes the events surrounding this verse so the translator can check key meaning.',
      ),
    ).toBeNull();
  });

  it('keeps Notes and Images visible when TQ load fails', async () => {
    mockLoadQuestions.mockRejectedValue(new Error('boom'));
    renderResources(2);

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();
    expect(screen.getByText('Translation Questions')).toBeTruthy();

    fireEvent.press(
      screen.getByTestId('resources-section-translationQuestions-toggle'),
    );

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-error')).toBeTruthy();
    });

    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.getByText('Images & Maps')).toBeTruthy();

    mockLoadQuestions.mockResolvedValue(getMockTranslationQuestions(99, 2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('translation-questions-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
    });
  });
});
