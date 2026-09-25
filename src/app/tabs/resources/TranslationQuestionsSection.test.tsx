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
import { TranslationQuestionItem } from '../../../types/resources/translationQuestions';
import { useTranslationQuestionsForUnit } from '../../../hooks/useTranslationQuestionsForUnit';

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

// Fixed fixture for the verse numbers this suite exercises — no live mock
// generator, so this test has no dependency on `mocks/resources`.
function questionsForVerse(verseNumber: number): TranslationQuestionItem[] {
  if (verseNumber !== 2) {
    return [];
  }
  return [
    {
      id: 'tq-99-2-1',
      question: 'What is happening in this verse?',
      answer:
        'The passage describes the events surrounding this verse so the translator can check key meaning.',
    },
  ];
}

function SectionHarness({
  projectId,
  verseNumber,
  sectionExpanded = true,
}: {
  projectId: number;
  verseNumber: number;
  sectionExpanded?: boolean;
}) {
  const { state, retry } = useTranslationQuestionsForUnit({
    projectId,
    bookCode: 'MRK',
    chapterNumber: 14,
    verseNumber,
  });
  return (
    <TranslationQuestionsSection
      state={state}
      retry={retry}
      projectId={projectId}
      bookCode="MRK"
      chapterNumber={14}
      verseNumber={verseNumber}
      sectionExpanded={sectionExpanded}
    />
  );
}

describe('TranslationQuestionsSection', () => {
  beforeEach(() => {
    mockLoad.mockImplementation(async ({ verseNumber }) =>
      questionsForVerse(verseNumber),
    );
  });

  afterEach(() => {
    setTranslationQuestionsLoadFailureForTests(false);
    mockLoad.mockReset();
  });

  it('hides content when no questions are available', async () => {
    render(<SectionHarness projectId={7} verseNumber={1} />);

    await waitFor(() => {
      expect(screen.queryByTestId('translation-questions-loading')).toBeNull();
    });
    expect(screen.queryByTestId('translation-questions-list')).toBeNull();
    expect(screen.queryByTestId('translation-questions-error')).toBeNull();
  });

  it('keeps answers hidden until a question accordion is expanded', async () => {
    render(<SectionHarness projectId={7} verseNumber={2} />);

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

  it('resets nested expansion when only projectId changes', async () => {
    const answer =
      'The passage describes the events surrounding this verse so the translator can check key meaning.';

    const { rerender } = render(
      <SectionHarness projectId={7} verseNumber={2} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
    });

    fireEvent.press(
      screen.getByTestId('translation-question-tq-99-2-1-toggle'),
    );
    expect(screen.getByText(answer)).toBeTruthy();

    rerender(<SectionHarness projectId={8} verseNumber={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
    });
    expect(screen.queryByText(answer)).toBeNull();
  });

  it('shows section-scoped error and recovers on Retry', async () => {
    mockLoad.mockRejectedValueOnce(new Error('boom'));
    mockLoad.mockResolvedValueOnce(questionsForVerse(2));

    render(<SectionHarness projectId={7} verseNumber={2} />);

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
