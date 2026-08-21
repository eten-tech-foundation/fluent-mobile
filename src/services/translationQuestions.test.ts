import type { AquiferResourceDetails } from '../types/api/aquifer';
import {
  loadTranslationQuestionsForUnit,
  parseAquiferTranslationQuestions,
  setTranslationQuestionsLoadFailureForTests,
} from './translationQuestions';
import { AquiferAPI } from './aquiferApi';

jest.mock('./aquiferApi', () => ({
  AquiferAPI: {
    searchResources: jest.fn(),
    getResourceDetails: jest.fn(),
  },
}));

const searchResources = AquiferAPI.searchResources as jest.MockedFunction<
  typeof AquiferAPI.searchResources
>;
const getResourceDetails = AquiferAPI.getResourceDetails as jest.MockedFunction<
  typeof AquiferAPI.getResourceDetails
>;

const sampleDetails: AquiferResourceDetails = {
  id: 175532,
  referenceId: 1,
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
  grouping: {
    type: 'Guide',
    name: 'Translation Questions',
    mediaType: 'Text',
  },
  language: {
    id: 1,
    code: 'eng',
    displayName: 'English',
    scriptDirection: 'LTR',
  },
};

describe('parseAquiferTranslationQuestions', () => {
  it('maps TipTap content to question/answer pairs', () => {
    expect(parseAquiferTranslationQuestions(sampleDetails)).toEqual([
      {
        id: 'tq-aquifer-175532-0',
        question: 'Why did the chief priests wait?',
        answer: 'They were worried that a riot would arise.',
      },
    ]);
  });
});

describe('loadTranslationQuestionsForUnit', () => {
  afterEach(() => {
    setTranslationQuestionsLoadFailureForTests(false);
    searchResources.mockReset();
    getResourceDetails.mockReset();
  });

  it('returns [] when Aquifer has no TQ for the unit', async () => {
    searchResources.mockResolvedValue({
      totalItemCount: 0,
      returnedItemCount: 0,
      offset: 0,
      items: [],
    });

    await expect(
      loadTranslationQuestionsForUnit({
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
  });

  it('searches Aquifer and parses resource details', async () => {
    searchResources.mockResolvedValue({
      totalItemCount: 1,
      returnedItemCount: 1,
      offset: 0,
      items: [
        {
          id: 175532,
          name: 'Mark 14:2',
          localizedName: 'Mark 14:2',
          mediaType: 'Text',
          languageCode: 'eng',
          grouping: {
            type: 'Guide',
            name: 'Translation Questions',
            collectionTitle: 'Translation Questions',
            collectionCode: 'UWTranslationQuestions',
          },
        },
      ],
    });
    getResourceDetails.mockResolvedValue(sampleDetails);

    const questions = await loadTranslationQuestionsForUnit({
      bookCode: 'MRK',
      chapterNumber: 14,
      verseNumber: 2,
    });

    expect(searchResources).toHaveBeenCalledWith(
      expect.objectContaining({
        bookCode: 'MRK',
        startChapter: 14,
        endChapter: 14,
        startVerse: 2,
        endVerse: 2,
        languageCode: 'eng',
        resourceCollectionCode: 'UWTranslationQuestions',
      }),
    );
    expect(questions[0]?.question).toContain('chief priests');
  });

  it('throws when test failure injection is on', async () => {
    setTranslationQuestionsLoadFailureForTests(true);
    await expect(
      loadTranslationQuestionsForUnit({
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).rejects.toThrow('Failed to load Translation Questions');
  });
});
