import type { ApiTranslationQuestionItem } from '../types/api/translationResources';
import {
  loadTranslationQuestionsForUnit,
  parseTranslationQuestionsItem,
  setTranslationQuestionsLoadFailureForTests,
} from './translationQuestions';
import { FluentAPI } from './api';

jest.mock('./api', () => ({
  FluentAPI: {
    getTranslationQuestions: jest.fn(),
  },
}));

const getTranslationQuestions =
  FluentAPI.getTranslationQuestions as jest.MockedFunction<
    typeof FluentAPI.getTranslationQuestions
  >;

const sampleItem: ApiTranslationQuestionItem = {
  id: 175532,
  name: 'Mark 14:2',
  localizedName: 'Mark 14:2',
  content: [
    {
      tiptap: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'bold' }],
                text: 'Why did the chief priests wait?',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'They were worried that a riot would arise.',
              },
            ],
          },
        ],
      },
    },
  ],
};

describe('parseTranslationQuestionsItem', () => {
  it('maps TipTap content to question/answer pairs', () => {
    expect(parseTranslationQuestionsItem(sampleItem)).toEqual([
      {
        id: 'tq-api-175532-0',
        question: 'Why did the chief priests wait?',
        answer: 'They were worried that a riot would arise.',
      },
    ]);
  });
});

describe('loadTranslationQuestionsForUnit', () => {
  afterEach(() => {
    setTranslationQuestionsLoadFailureForTests(false);
    getTranslationQuestions.mockReset();
  });

  it('returns [] when projectId is null', async () => {
    await expect(
      loadTranslationQuestionsForUnit({
        projectId: null,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getTranslationQuestions).not.toHaveBeenCalled();
  });

  it('returns [] when bookCode is missing', async () => {
    await expect(
      loadTranslationQuestionsForUnit({
        projectId: 7,
        bookCode: '',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getTranslationQuestions).not.toHaveBeenCalled();
  });

  it('returns [] when API has no TQ for the unit', async () => {
    getTranslationQuestions.mockResolvedValue({ items: [] });

    await expect(
      loadTranslationQuestionsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
  });

  it('calls FluentAPI and parses resource items', async () => {
    getTranslationQuestions.mockResolvedValue({ items: [sampleItem] });

    const questions = await loadTranslationQuestionsForUnit({
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 14,
      verseNumber: 2,
    });

    expect(getTranslationQuestions).toHaveBeenCalledWith(
      7,
      'MRK',
      14,
      2,
      'eng',
    );
    expect(questions[0]?.question).toContain('chief priests');
  });

  it('throws when test failure injection is on', async () => {
    setTranslationQuestionsLoadFailureForTests(true);
    await expect(
      loadTranslationQuestionsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).rejects.toThrow('Failed to load Translation Questions');
  });
});
