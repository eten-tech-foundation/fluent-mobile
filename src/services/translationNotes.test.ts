import type { AquiferResourceDetails } from '../types/api/aquifer';
import {
  loadTranslationNotesForUnit,
  parseAquiferTranslationNotes,
  setTranslationNotesLoadFailureForTests,
} from './translationNotes';
import { AquiferAPI } from './aquiferApi';
import { ApiError } from './apiError';

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
  id: 12345,
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
            content: [{ type: 'text', text: 'connecting word' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'This phrase connects the current verse to the previous one.',
              },
            ],
          },
        ],
      },
    },
  ],
  grouping: {
    type: 'Guide',
    name: 'Translation Notes',
    mediaType: 'Text',
  },
  language: {
    id: 1,
    code: 'eng',
    displayName: 'English',
    scriptDirection: 'LTR',
  },
};

describe('parseAquiferTranslationNotes', () => {
  it('maps TipTap content to note title/body', () => {
    expect(parseAquiferTranslationNotes(sampleDetails)).toEqual([
      {
        id: 'tn-aquifer-12345-0',
        title: 'Mark 14:2',
        body: 'connecting word\nThis phrase connects the current verse to the previous one.',
      },
    ]);
  });
});

describe('loadTranslationNotesForUnit', () => {
  afterEach(() => {
    setTranslationNotesLoadFailureForTests(false);
    searchResources.mockReset();
    getResourceDetails.mockReset();
  });

  it('returns [] when bookCode is missing', async () => {
    await expect(
      loadTranslationNotesForUnit({
        bookCode: '  ',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(searchResources).not.toHaveBeenCalled();
  });

  it('returns [] when Aquifer has no TN for the unit', async () => {
    searchResources.mockResolvedValue({
      totalItemCount: 0,
      returnedItemCount: 0,
      offset: 0,
      items: [],
    });

    await expect(
      loadTranslationNotesForUnit({
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
  });

  it('returns [] when Aquifer search payload omits items', async () => {
    searchResources.mockResolvedValue({} as never);

    await expect(
      loadTranslationNotesForUnit({
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getResourceDetails).not.toHaveBeenCalled();
  });

  it('propagates Aquifer ApiError so the section can show retry', async () => {
    searchResources.mockRejectedValue(
      new ApiError(0, 'Aquifer request returned no response'),
    );

    await expect(
      loadTranslationNotesForUnit({
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: expect.stringMatching(/no response/i),
    });
  });

  it('searches Aquifer and parses resource details', async () => {
    searchResources.mockResolvedValue({
      totalItemCount: 1,
      returnedItemCount: 1,
      offset: 0,
      items: [
        {
          id: 12345,
          name: 'Mark 14:2',
          localizedName: 'Mark 14:2',
          mediaType: 'Text',
          languageCode: 'eng',
          grouping: {
            type: 'Guide',
            name: 'Translation Notes',
            collectionTitle: 'Translation Notes',
            collectionCode: 'UWTranslationNotes',
          },
        },
      ],
    });
    getResourceDetails.mockResolvedValue(sampleDetails);

    await expect(
      loadTranslationNotesForUnit({
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).resolves.toEqual([
      {
        id: 'tn-aquifer-12345-0',
        title: 'Mark 14:2',
        body: 'connecting word\nThis phrase connects the current verse to the previous one.',
      },
    ]);

    expect(searchResources).toHaveBeenCalledWith({
      bookCode: 'MRK',
      startChapter: 14,
      endChapter: 14,
      startVerse: 2,
      endVerse: 2,
      languageCode: 'eng',
      resourceCollectionCode: 'UWTranslationNotes',
      limit: 50,
    });
  });

  it('throws when failure injection is enabled', async () => {
    setTranslationNotesLoadFailureForTests(true);
    await expect(
      loadTranslationNotesForUnit({
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).rejects.toThrow(/Failed to load Translation Notes/);
  });
});
