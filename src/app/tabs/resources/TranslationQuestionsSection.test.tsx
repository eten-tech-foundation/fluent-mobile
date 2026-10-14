import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TranslationQuestionsSection } from './TranslationQuestionsSection';
import { TRANSLATION_QUESTIONS_LOAD_ERROR } from '../../../constants/messages';
import type { TranslationQuestionItem } from '../../../types/resources/translationQuestions';
import type { TranslationQuestionsLoadState } from '../../../hooks/useTranslationQuestionsForUnit';

// Fixed fixture — no dependency on `mocks/resources`.
const SAMPLE_QUESTIONS: TranslationQuestionItem[] = [
  {
    id: 'tq-99-2-1',
    question: 'What is happening in this verse?',
    answer:
      'The passage describes the events surrounding this verse so the translator can check key meaning.',
  },
];

function renderSection(
  state: TranslationQuestionsLoadState | undefined,
  retry: () => void = jest.fn(),
  overrides: Partial<{
    bookCode: string;
    chapterNumber: number;
    verseNumber: number;
    sectionExpanded: boolean;
  }> = {},
) {
  return render(
    <TranslationQuestionsSection
      state={state}
      retry={retry}
      sectionExpanded={overrides.sectionExpanded ?? true}
      bookCode={overrides.bookCode ?? 'MRK'}
      chapterNumber={overrides.chapterNumber ?? 14}
      verseNumber={overrides.verseNumber ?? 2}
    />,
  );
}

describe('TranslationQuestionsSection', () => {
  it('hides content when no questions are available', () => {
    renderSection({ status: 'ready', questions: [] });
    expect(screen.queryByTestId('translation-questions-loading')).toBeNull();
    expect(screen.queryByTestId('translation-questions-list')).toBeNull();
    expect(screen.queryByTestId('translation-questions-error')).toBeNull();
  });

  it('keeps answers hidden until a question accordion is expanded', () => {
    renderSection({
      status: 'ready',
      questions: SAMPLE_QUESTIONS,
    });

    expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
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

  it('resets nested expansion when the unit identity changes', () => {
    const answer =
      'The passage describes the events surrounding this verse so the translator can check key meaning.';
    const questions = SAMPLE_QUESTIONS;

    const { rerender } = renderSection({
      status: 'ready',
      questions,
    });

    fireEvent.press(
      screen.getByTestId('translation-question-tq-99-2-1-toggle'),
    );
    expect(screen.getByText(answer)).toBeTruthy();

    rerender(
      <TranslationQuestionsSection
        state={{ status: 'ready', questions }}
        retry={jest.fn()}
        sectionExpanded
        bookCode="MRK"
        chapterNumber={14}
        verseNumber={5}
      />,
    );

    expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
    expect(screen.queryByText(answer)).toBeNull();
  });

  it('shows section-scoped error and recovers on Retry', () => {
    const retry = jest.fn();
    const { rerender } = renderSection(
      { status: 'error', message: TRANSLATION_QUESTIONS_LOAD_ERROR },
      retry,
    );

    expect(screen.getByTestId('translation-questions-error')).toBeTruthy();
    expect(screen.getByText(TRANSLATION_QUESTIONS_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByTestId('translation-questions-list')).toBeNull();

    fireEvent.press(screen.getByTestId('translation-questions-retry'));
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(
      <TranslationQuestionsSection
        state={{
          status: 'ready',
          questions: SAMPLE_QUESTIONS,
        }}
        retry={retry}
        sectionExpanded
        bookCode="MRK"
        chapterNumber={14}
        verseNumber={2}
      />,
    );

    expect(screen.getByTestId('translation-questions-list')).toBeTruthy();
  });

  it('treats a missing load state as loading instead of crashing', () => {
    renderSection(undefined);
    expect(screen.getByTestId('translation-questions-loading')).toBeTruthy();
  });
});
