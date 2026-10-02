import type { ApiTranslationQuestionItem } from '../types/api/translationResources';
import {
  loadTranslationQuestionsForUnit,
  parseTranslationQuestionsItem,
  setTranslationQuestionsLoadFailureForTests,
} from './translationQuestions';
import { FluentAPI } from './api';
import { findDownloadedRows, readDownloadedJson } from './offlineResources';
import type { DownloadQueueItem } from '../types/download/types';

jest.mock('./api', () => ({
  FluentAPI: {
    getTranslationQuestions: jest.fn(),
  },
}));

jest.mock('./offlineResources', () => ({
  findDownloadedRows: jest.fn(),
  readDownloadedJson: jest.fn(),
}));

const mockFindRows = findDownloadedRows as jest.MockedFunction<
  typeof findDownloadedRows
>;
const mockReadJson = readDownloadedJson as jest.MockedFunction<
  typeof readDownloadedJson
>;

const getTranslationQuestions =
  FluentAPI.getTranslationQuestions as jest.MockedFunction<
    typeof FluentAPI.getTranslationQuestions
  >;

function downloadedRow(
  overrides: Partial<DownloadQueueItem> = {},
): DownloadQueueItem {
  return {
    id: '42-7-tq-mrk-14-2',
    tier: 2,
    label: 'Mark 14:2',
    progress: 1,
    status: 'completed',
    ...overrides,
  };
}

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
  beforeEach(() => {
    // Default: nothing downloaded → the API path is exercised.
    mockFindRows.mockResolvedValue(null);
  });

  afterEach(() => {
    setTranslationQuestionsLoadFailureForTests(false);
    getTranslationQuestions.mockReset();
    mockFindRows.mockReset();
    mockReadJson.mockReset();
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

  describe('download-first', () => {
    it('uses downloaded rows and skips the API, even when online', async () => {
      mockFindRows.mockResolvedValue([
        downloadedRow({ localFilePath: 'file:///downloads/tq.json' }),
      ]);
      mockReadJson.mockResolvedValue(sampleItem.content);
      getTranslationQuestions.mockResolvedValue({ items: [sampleItem] });

      await expect(
        loadTranslationQuestionsForUnit({
          projectId: 7,
          userId: 42,
          isOnline: true,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([
        {
          id: 'tq-api-42-7-tq-mrk-14-2-0',
          question: 'Why did the chief priests wait?',
          answer: 'They were worried that a riot would arise.',
        },
      ]);
      expect(getTranslationQuestions).not.toHaveBeenCalled();
    });

    it('falls back to the API when nothing is downloaded and online', async () => {
      mockFindRows.mockResolvedValue(null);
      getTranslationQuestions.mockResolvedValue({ items: [sampleItem] });

      await expect(
        loadTranslationQuestionsForUnit({
          projectId: 7,
          userId: 42,
          isOnline: true,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([
        {
          id: 'tq-api-175532-0',
          question: 'Why did the chief priests wait?',
          answer: 'They were worried that a riot would arise.',
        },
      ]);
      expect(getTranslationQuestions).toHaveBeenCalledTimes(1);
    });

    it('falls back to the API when every downloaded file is unreadable', async () => {
      mockFindRows.mockResolvedValue([
        downloadedRow({ localFilePath: 'file:///downloads/tq.json' }),
      ]);
      mockReadJson.mockResolvedValue(undefined);
      getTranslationQuestions.mockResolvedValue({ items: [sampleItem] });

      await expect(
        loadTranslationQuestionsForUnit({
          projectId: 7,
          userId: 42,
          isOnline: true,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([
        {
          id: 'tq-api-175532-0',
          question: 'Why did the chief priests wait?',
          answer: 'They were worried that a riot would arise.',
        },
      ]);
      expect(getTranslationQuestions).toHaveBeenCalledTimes(1);
    });

    it('does not call the API offline when a downloaded row exists but its file is unreadable', async () => {
      mockFindRows.mockResolvedValue([
        downloadedRow({ localFilePath: 'file:///downloads/tq.json' }),
      ]);
      mockReadJson.mockResolvedValue(undefined);

      await expect(
        loadTranslationQuestionsForUnit({
          projectId: 7,
          userId: 42,
          isOnline: false,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([]);
      expect(getTranslationQuestions).not.toHaveBeenCalled();
    });
  });
});
