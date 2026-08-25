import type { ApiTranslationNoteItem } from '../types/api/translationResources';
import {
  loadTranslationNotesForUnit,
  parseTranslationNotesItem,
  setTranslationNotesLoadFailureForTests,
} from './translationNotes';
import { FluentAPI } from './api';
import { ApiError } from './apiError';

jest.mock('./api', () => ({
  FluentAPI: {
    getTranslationNotes: jest.fn(),
  },
}));

const getTranslationNotes =
  FluentAPI.getTranslationNotes as jest.MockedFunction<
    typeof FluentAPI.getTranslationNotes
  >;

const sampleItem: ApiTranslationNoteItem = {
  id: 12345,
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
};

describe('parseTranslationNotesItem', () => {
  it('maps TipTap content to note title/body', () => {
    expect(parseTranslationNotesItem(sampleItem)).toEqual([
      {
        id: 'tn-api-12345-0',
        title: 'Mark 14:2',
        body: 'connecting word\nThis phrase connects the current verse to the previous one.',
      },
    ]);
  });
});

describe('loadTranslationNotesForUnit', () => {
  afterEach(() => {
    setTranslationNotesLoadFailureForTests(false);
    getTranslationNotes.mockReset();
  });

  it('returns [] when projectId is null', async () => {
    await expect(
      loadTranslationNotesForUnit({
        projectId: null,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getTranslationNotes).not.toHaveBeenCalled();
  });

  it('returns [] when bookCode is missing', async () => {
    await expect(
      loadTranslationNotesForUnit({
        projectId: 7,
        bookCode: '  ',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getTranslationNotes).not.toHaveBeenCalled();
  });

  it('returns [] when API has no TN for the unit', async () => {
    getTranslationNotes.mockResolvedValue({ items: [] });

    await expect(
      loadTranslationNotesForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
  });

  it('returns [] when API payload omits items', async () => {
    getTranslationNotes.mockResolvedValue({} as never);

    await expect(
      loadTranslationNotesForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
  });

  it('propagates ApiError so the section can show retry', async () => {
    getTranslationNotes.mockRejectedValue(
      new ApiError(502, 'Aquifer service is unavailable'),
    );

    await expect(
      loadTranslationNotesForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      message: expect.stringMatching(/unavailable/i),
    });
  });

  it('calls FluentAPI and parses resource items', async () => {
    getTranslationNotes.mockResolvedValue({ items: [sampleItem] });

    await expect(
      loadTranslationNotesForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).resolves.toEqual([
      {
        id: 'tn-api-12345-0',
        title: 'Mark 14:2',
        body: 'connecting word\nThis phrase connects the current verse to the previous one.',
      },
    ]);

    expect(getTranslationNotes).toHaveBeenCalledWith(7, 'MRK', 14, 2, 'eng');
  });

  it('throws when failure injection is enabled', async () => {
    setTranslationNotesLoadFailureForTests(true);
    await expect(
      loadTranslationNotesForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).rejects.toThrow(/Failed to load Translation Notes/);
  });
});
