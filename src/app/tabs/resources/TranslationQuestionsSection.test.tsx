import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { TranslationQuestionsSection } from './TranslationQuestionsSection';
import { TRANSLATION_QUESTIONS_LOAD_ERROR } from '../../../constants/messages';
import {
  loadTranslationQuestionsForUnit,
  setTranslationQuestionsLoadFailureForTests,
} from '../../../services/translationQuestions';
import { getMockTranslationQuestions } from '../../../mocks/resources/translationQuestionsMock';

jest.mock('../../../services/translationQuestions', () => {
  const actual = jest.requireActual('../../../services/translationQuestions');
  return {
    ...actual,
    loadTranslationQuestionsForUnit: jest.fn(),
  };
});

const mockLoad = loadTranslationQuestionsForUnit as jest.MockedFunction<
  typeof loadTranslationQuestionsForUnit
>;

describe('TranslationQuestionsSection', () => {
  beforeEach(() => {
    mockLoad.mockImplementation(async ({ verseNumber }) =>
      getMockTranslationQuestions(99, verseNumber),
    );
  });

  afterEach(() => {
    setTranslationQuestionsLoadFailureForTests(false);
    mockLoad.mockReset();
  });

  it('hides content when no questions are available', async () => {
    render(
      <TranslationQuestionsSection
        bookCode="MRK"
        chapterNumber={14}
        verseNumber={1}
        sectionExpanded
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('translation-questions-loading')).toBeNull();
    });
    expect(screen.queryByTestId('translation-questions-list')).toBeNull();
    expect(screen.queryByTestId('translation-questions-error')).toBeNull();
  });

  it('keeps answers hidden until a question accordion is expanded', async () => {
    render(
      <TranslationQuestionsSection
        bookCode="MRK"
        chapterNumber={14}
        verseNumber={2}
        sectionExpanded
      />,
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

    fireEvent.press(
      screen.getByTestId('translation-question-tq-99-2-1-toggle'),
    );

    expect(
      screen.getByText(
        'The passage describes the events surrounding this verse so the translator can check key meaning.',
      ),
    ).toBeTruthy();
  });

  it('shows section-scoped error and recovers on Retry', async () => {
    mockLoad.mockRejectedValueOnce(new Error('boom'));
    mockLoad.mockResolvedValueOnce(getMockTranslationQuestions(99, 2));

    render(
      <TranslationQuestionsSection
        bookCode="MRK"
        chapterNumber={14}
        verseNumber={2}
        sectionExpanded
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-error')).toBeTruthy();
    });
    expect(screen.getByText(TRANSLATION_QUESTIONS_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByTestId('translation-questions-list')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('translation-questions-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
    });
  });
});
