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

jest.mock('../../services/translationQuestions', () => {
  const actual = jest.requireActual('../../services/translationQuestions');
  return {
    ...actual,
    loadTranslationQuestionsForUnit: jest.fn(),
  };
});

const mockLoad = loadTranslationQuestionsForUnit as jest.MockedFunction<
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
    mockLoad.mockImplementation(async ({ verseNumber }) =>
      getMockTranslationQuestions(99, verseNumber),
    );
  });

  afterEach(() => {
    setTranslationQuestionsLoadFailureForTests(false);
    mockLoad.mockReset();
  });

  it('shows the empty message when the unit has no resources', () => {
    renderResources(3);
    expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Translation Notes')).toBeNull();
  });

  it('shows Translation Questions below Notes when questions exist', () => {
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
  });

  it('hides Translation Questions when none are available for the unit', () => {
    renderResources(1);
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText('Translation Questions')).toBeNull();
  });

  it('updates immediately when the selected verse changes', () => {
    renderResources(2);
    expect(screen.getByText('Translation Notes')).toBeTruthy();

    fireEvent.press(screen.getByTestId('select-verse-3'));
    expect(screen.getByText(RESOURCES_EMPTY_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Translation Notes')).toBeNull();

    fireEvent.press(screen.getByTestId('select-verse-1'));
    expect(screen.getByText('Mark 14:1')).toBeTruthy();
    expect(screen.getByText('Translation Notes')).toBeTruthy();
    expect(screen.queryByText('Translation Questions')).toBeNull();
  });

  it('restores open accordion state when returning to a unit', () => {
    renderResources(2);

    fireEvent.press(
      screen.getByTestId('resources-section-translationNotes-toggle'),
    );
    expect(
      screen.getByText('Content for this section will appear here.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('select-verse-1'));
    expect(
      screen.queryByText('Content for this section will appear here.'),
    ).toBeNull();

    fireEvent.press(screen.getByTestId('select-verse-2'));
    expect(
      screen.getByText('Content for this section will appear here.'),
    ).toBeTruthy();
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
    mockLoad.mockRejectedValue(new Error('boom'));
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

    mockLoad.mockResolvedValue(getMockTranslationQuestions(99, 2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('translation-questions-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
    });
  });
});
