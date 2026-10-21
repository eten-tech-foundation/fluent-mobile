/**
 * ISOLATED evidence for issue #192 cached Resources path (no live device trace).
 *
 * Exercises real hooks → real loaders → real offlineResources readers.
 * Mocks only download-queue DB + expo FS; spies FluentAPI at the remote boundary.
 * Does not mock loadTranslation* / loadImagesMaps / findDownloadedRows / readDownloadedJson.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { renderHook, waitFor } from '@testing-library/react-native';
import { getDownloadedResourcesForChapter } from '../db/downloadQueueRepository';
import { FluentAPI } from '../services/api';
import type { DownloadQueueItem } from '../types/download/types';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import { useImagesMapsForUnit } from './useImagesMapsForUnit';
import { useTranslationNotesForUnit } from './useTranslationNotesForUnit';
import { useTranslationQuestionsForUnit } from './useTranslationQuestionsForUnit';

jest.mock('../db/downloadQueueRepository', () => ({
  getDownloadedResourcesForChapter: jest.fn(),
}));

jest.mock('../services/api', () => ({
  FluentAPI: {
    getTranslationNotes: jest.fn(),
    getTranslationQuestions: jest.fn(),
    getTranslationImages: jest.fn(),
  },
}));

const mockGetRows = getDownloadedResourcesForChapter as jest.MockedFunction<
  typeof getDownloadedResourcesForChapter
>;

const getTranslationNotes =
  FluentAPI.getTranslationNotes as jest.MockedFunction<
    typeof FluentAPI.getTranslationNotes
  >;
const getTranslationQuestions =
  FluentAPI.getTranslationQuestions as jest.MockedFunction<
    typeof FluentAPI.getTranslationQuestions
  >;
const getTranslationImages =
  FluentAPI.getTranslationImages as jest.MockedFunction<
    typeof FluentAPI.getTranslationImages
  >;

const PROJECT_ID = 7;
const USER_ID = 42;
const BOOK = 'MRK';
const CHAPTER = 14;
const VERSE = 2;

const TN_URI = 'file:///downloads/tn-mrk-14-2.json';
const TQ_URI = 'file:///downloads/tq-mrk-14-2.json';
const IMG_URI = 'file:///downloads/map-mrk-14.png';

const TN_CONTENT = [
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
];

const TQ_CONTENT = [
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
];

/** Minimal 1×1 PNG (base64) — offline image fixture for IMG_URI. */
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function queueRow(
  overrides: Partial<DownloadQueueItem> = {},
): DownloadQueueItem {
  return {
    id: 'row',
    tier: 1,
    label: 'Mark 14:2',
    progress: 1,
    status: 'completed',
    projectId: PROJECT_ID,
    userId: USER_ID,
    bookCode: BOOK,
    startChapter: CHAPTER,
    endChapter: CHAPTER,
    ...overrides,
  };
}

/** Mirrors getDownloadedResourcesForChapter WHERE (all six lookup args). */
function rowMatchesLookup(
  row: DownloadQueueItem,
  projectId: number,
  userId: number,
  resourceName: string,
  kind: 'text' | 'audio' | 'image',
  bookCode: string,
  chapter: number,
): boolean {
  return (
    row.projectId === projectId &&
    row.userId === userId &&
    row.resourceName === resourceName &&
    row.kind === kind &&
    row.bookCode === bookCode &&
    typeof row.startChapter === 'number' &&
    typeof row.endChapter === 'number' &&
    row.startChapter <= chapter &&
    row.endChapter >= chapter
  );
}

function cachedFixtureRows(): DownloadQueueItem[] {
  return [
    queueRow({
      id: '42-7-tn-mrk-14-2',
      resourceId: 'local-tn',
      resourceName: 'Translation Notes',
      kind: 'text',
      label: 'Mark 14:2',
      localFilePath: TN_URI,
      verseStart: 2,
      verseEnd: 2,
    }),
    queueRow({
      id: '42-7-tq-mrk-14-2',
      resourceId: 'local-tq',
      tier: 2,
      resourceName: 'Translation Questions',
      kind: 'text',
      label: 'Mark 14:2',
      localFilePath: TQ_URI,
      verseStart: 2,
      verseEnd: 2,
    }),
    queueRow({
      id: '42-7-img-mrk-14',
      tier: 3,
      resourceName: 'Reference Images',
      kind: 'image',
      label: 'Jerusalem region map',
      localFilePath: IMG_URI,
    }),
  ];
}

function mockInventoryFromFixtures(rows: DownloadQueueItem[]): void {
  mockGetRows.mockImplementation(
    async (projectId, userId, resourceName, kind, bookCode, chapter) =>
      rows.filter(row =>
        rowMatchesLookup(
          row,
          projectId,
          userId,
          resourceName,
          kind,
          bookCode,
          chapter,
        ),
      ),
  );
}

function stubRemoteMustNotBeReached(): void {
  const boom = () => {
    throw new Error('remote must not be reached on cached/offline path');
  };
  getTranslationNotes.mockImplementation(boom);
  getTranslationQuestions.mockImplementation(boom);
  getTranslationImages.mockImplementation(boom);
}

async function seedLocalResourceFiles(): Promise<void> {
  await FileSystem.writeAsStringAsync(TN_URI, JSON.stringify(TN_CONTENT));
  await FileSystem.writeAsStringAsync(TQ_URI, JSON.stringify(TQ_CONTENT));
  await FileSystem.writeAsStringAsync(IMG_URI, MINIMAL_PNG_BASE64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

describe('cached Resources path — no network (#192, ISOLATED)', () => {
  beforeEach(() => {
    resetFileSystemMock();
    jest.clearAllMocks();
    stubRemoteMustNotBeReached();
  });

  it('TN/TQ/Images load from inventory+local files offline without FluentAPI', async () => {
    await seedLocalResourceFiles();
    const imgInfo = await FileSystem.getInfoAsync(IMG_URI);
    expect(imgInfo.exists).toBe(true);

    mockInventoryFromFixtures(cachedFixtureRows());

    const unit = {
      projectId: PROJECT_ID,
      userId: USER_ID,
      isOnline: false as const,
      bookCode: BOOK,
      chapterNumber: CHAPTER,
      verseNumber: VERSE,
    };

    const tn = renderHook(() => useTranslationNotesForUnit(unit));
    const tq = renderHook(() => useTranslationQuestionsForUnit(unit));
    const img = renderHook(() => useImagesMapsForUnit(unit));

    await waitFor(() => {
      expect(tn.result.current.state.status).toBe('ready');
      expect(tq.result.current.state.status).toBe('ready');
      expect(img.result.current.state.status).toBe('ready');
    });

    if (tn.result.current.state.status !== 'ready') {
      throw new Error('expected TN ready');
    }
    if (tq.result.current.state.status !== 'ready') {
      throw new Error('expected TQ ready');
    }
    if (img.result.current.state.status !== 'ready') {
      throw new Error('expected Images ready');
    }

    expect(tn.result.current.state.notes).toEqual([
      {
        id: 'tn-api-local-tn-0',
        title: 'Mark 14:2',
        body: 'connecting word\nThis phrase connects the current verse to the previous one.',
      },
    ]);
    expect(tq.result.current.state.questions).toEqual([
      {
        id: 'tq-api-local-tq-0',
        question: 'Why did the chief priests wait?',
        answer: 'They were worried that a riot would arise.',
      },
    ]);
    expect(img.result.current.state.items).toEqual([
      {
        id: 'img-local-42-7-img-mrk-14',
        title: 'Jerusalem region map',
        uri: IMG_URI,
      },
    ]);

    expect(mockGetRows).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      'Translation Notes',
      'text',
      BOOK,
      CHAPTER,
    );
    expect(mockGetRows).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      'Translation Questions',
      'text',
      BOOK,
      CHAPTER,
    );
    expect(mockGetRows).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      'Reference Images',
      'image',
      BOOK,
      CHAPTER,
    );
    expect(getTranslationNotes).not.toHaveBeenCalled();
    expect(getTranslationQuestions).not.toHaveBeenCalled();
    expect(getTranslationImages).not.toHaveBeenCalled();
  });

  it('inventory mismatch on project/user/book/chapter returns no cached rows', async () => {
    await seedLocalResourceFiles();
    mockInventoryFromFixtures(cachedFixtureRows());

    await expect(
      mockGetRows(
        PROJECT_ID + 1,
        USER_ID,
        'Translation Notes',
        'text',
        BOOK,
        CHAPTER,
      ),
    ).resolves.toEqual([]);
    await expect(
      mockGetRows(
        PROJECT_ID,
        USER_ID + 1,
        'Translation Notes',
        'text',
        BOOK,
        CHAPTER,
      ),
    ).resolves.toEqual([]);
    await expect(
      mockGetRows(
        PROJECT_ID,
        USER_ID,
        'Translation Notes',
        'text',
        'MAT',
        CHAPTER,
      ),
    ).resolves.toEqual([]);
    await expect(
      mockGetRows(
        PROJECT_ID,
        USER_ID,
        'Translation Notes',
        'text',
        BOOK,
        CHAPTER + 1,
      ),
    ).resolves.toEqual([]);
    await expect(
      mockGetRows(
        PROJECT_ID,
        USER_ID,
        'Translation Notes',
        'text',
        BOOK,
        CHAPTER,
      ),
    ).resolves.toHaveLength(1);

    const mismatchedUnit = {
      projectId: PROJECT_ID + 1,
      userId: USER_ID,
      isOnline: false as const,
      bookCode: BOOK,
      chapterNumber: CHAPTER,
      verseNumber: VERSE,
    };
    const tn = renderHook(() => useTranslationNotesForUnit(mismatchedUnit));
    const img = renderHook(() => useImagesMapsForUnit(mismatchedUnit));

    await waitFor(() => {
      expect(tn.result.current.state.status).toBe('ready');
      expect(img.result.current.state.status).toBe('ready');
    });

    if (tn.result.current.state.status !== 'ready') {
      throw new Error('expected TN ready');
    }
    if (img.result.current.state.status !== 'ready') {
      throw new Error('expected Images ready');
    }
    expect(tn.result.current.state.notes).toEqual([]);
    expect(img.result.current.state.items).toEqual([]);
    expect(getTranslationNotes).not.toHaveBeenCalled();
    expect(getTranslationImages).not.toHaveBeenCalled();
  });

  it('empty inventory offline returns ready empty sections without FluentAPI', async () => {
    mockGetRows.mockResolvedValue([]);

    const unit = {
      projectId: PROJECT_ID,
      userId: USER_ID,
      isOnline: false as const,
      bookCode: BOOK,
      chapterNumber: CHAPTER,
      verseNumber: VERSE,
    };

    const tn = renderHook(() => useTranslationNotesForUnit(unit));
    const tq = renderHook(() => useTranslationQuestionsForUnit(unit));
    const img = renderHook(() => useImagesMapsForUnit(unit));

    await waitFor(() => {
      expect(tn.result.current.state.status).toBe('ready');
      expect(tq.result.current.state.status).toBe('ready');
      expect(img.result.current.state.status).toBe('ready');
    });

    if (tn.result.current.state.status !== 'ready') {
      throw new Error('expected TN ready');
    }
    if (tq.result.current.state.status !== 'ready') {
      throw new Error('expected TQ ready');
    }
    if (img.result.current.state.status !== 'ready') {
      throw new Error('expected Images ready');
    }

    expect(tn.result.current.state.notes).toEqual([]);
    expect(tq.result.current.state.questions).toEqual([]);
    expect(img.result.current.state.items).toEqual([]);
    expect(getTranslationNotes).not.toHaveBeenCalled();
    expect(getTranslationQuestions).not.toHaveBeenCalled();
    expect(getTranslationImages).not.toHaveBeenCalled();
  });

  it('control: empty inventory online reaches FluentAPI (spy causal wiring)', async () => {
    mockGetRows.mockResolvedValue([]);
    getTranslationNotes.mockResolvedValue({ items: [] });
    getTranslationQuestions.mockResolvedValue({ items: [] });
    getTranslationImages.mockResolvedValue({ items: [] });

    const unit = {
      projectId: PROJECT_ID,
      userId: USER_ID,
      isOnline: true as const,
      bookCode: BOOK,
      chapterNumber: CHAPTER,
      verseNumber: VERSE,
    };

    const tn = renderHook(() => useTranslationNotesForUnit(unit));
    const tq = renderHook(() => useTranslationQuestionsForUnit(unit));
    const img = renderHook(() => useImagesMapsForUnit(unit));

    await waitFor(() => {
      expect(tn.result.current.state.status).toBe('ready');
      expect(tq.result.current.state.status).toBe('ready');
      expect(img.result.current.state.status).toBe('ready');
    });

    expect(getTranslationNotes).toHaveBeenCalledWith(
      PROJECT_ID,
      BOOK,
      CHAPTER,
      VERSE,
      'eng',
    );
    expect(getTranslationQuestions).toHaveBeenCalledWith(
      PROJECT_ID,
      BOOK,
      CHAPTER,
      VERSE,
      'eng',
    );
    expect(getTranslationImages).toHaveBeenCalledWith(
      PROJECT_ID,
      BOOK,
      CHAPTER,
      VERSE,
      'eng',
    );
  });
});
