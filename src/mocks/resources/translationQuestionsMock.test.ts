import {
  getMockTranslationQuestions,
  loadTranslationQuestionsForUnit,
  setMockTranslationQuestionsLoadFailure,
} from './translationQuestionsMock';

describe('translationQuestionsMock', () => {
  afterEach(() => {
    setMockTranslationQuestionsLoadFailure(false);
  });

  it('returns no questions when the shell hides the TQ section', () => {
    expect(getMockTranslationQuestions(99, 1)).toEqual([]);
    expect(getMockTranslationQuestions(99, 3)).toEqual([]);
  });

  it('returns Q/A pairs when the shell shows the TQ section', () => {
    const questions = getMockTranslationQuestions(99, 2);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0]?.question).toBeTruthy();
    expect(questions.some(q => q.answer.trim().length === 0)).toBe(true);
  });

  it('throws when failure injection is enabled', async () => {
    setMockTranslationQuestionsLoadFailure(true);
    await expect(loadTranslationQuestionsForUnit(99, 2)).rejects.toThrow(
      /Failed to load Translation Questions/,
    );
  });
});
