import {
  getMockTranslationQuestions,
  setMockTranslationQuestionsLoadFailure,
} from './translationQuestionsMock';
import {
  loadTranslationQuestionsForUnit,
  setTranslationQuestionsLoadFailureForTests,
} from '../../services/translationQuestions';

describe('translationQuestionsMock', () => {
  afterEach(() => {
    setMockTranslationQuestionsLoadFailure(false);
    setTranslationQuestionsLoadFailureForTests(false);
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

  it('failure injection alias enables the Aquifer loader throw path', async () => {
    setMockTranslationQuestionsLoadFailure(true);
    await expect(
      loadTranslationQuestionsForUnit({
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).rejects.toThrow(/Failed to load Translation Questions/);
  });
});
