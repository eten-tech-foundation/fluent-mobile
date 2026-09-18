const mockExecute = jest.fn();

jest.mock('./db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
  }),
}));

jest.mock('./repository', () => ({
  ensureUserProjectMembership: jest.fn(async () => undefined),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(() => 7),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn(),
  getUserIdSync: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { getPericopesForChapter, getSelectedTakeCoverages } from './queries';

describe('getPericopesForChapter', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns the full span for pericopes that intersect the chapter', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          pericope_number: '9',
          pericope_title: null,
          section: 1,
          chapter_number: 1,
          verse_number: 31,
        },
        {
          pericope_number: '9',
          pericope_title: null,
          section: 1,
          chapter_number: 2,
          verse_number: 1,
        },
        {
          pericope_number: '9',
          pericope_title: null,
          section: 1,
          chapter_number: 2,
          verse_number: 2,
        },
      ],
    });

    const groups = await getPericopesForChapter(1, 2, 10);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('EXISTS'),
      [1, 10, 2],
    );
    expect(groups).toEqual([
      {
        pericopeNumber: '9',
        pericopeTitle: null,
        section: 1,
        verses: [
          { chapterNumber: 1, verseNumber: 31 },
          { chapterNumber: 2, verseNumber: 1 },
          { chapterNumber: 2, verseNumber: 2 },
        ],
      },
    ]);
  });

  it('orders groups by scripture position, not FCBH section number', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          pericope_number: '1',
          pericope_title: null,
          section: 2,
          chapter_number: 1,
          verse_number: 16,
        },
        {
          pericope_number: '1',
          pericope_title: null,
          section: 2,
          chapter_number: 1,
          verse_number: 20,
        },
        {
          pericope_number: '1',
          pericope_title: null,
          section: 51,
          chapter_number: 1,
          verse_number: 1,
        },
        {
          pericope_number: '1',
          pericope_title: null,
          section: 51,
          chapter_number: 1,
          verse_number: 5,
        },
      ],
    });

    const groups = await getPericopesForChapter(41, 1, 1);

    expect(groups.map(group => group.verses[0]?.verseNumber)).toEqual([1, 16]);
    expect(groups[0]?.section).toBe(51);
    expect(groups[1]?.section).toBe(2);
  });
});

describe('getSelectedTakeCoverages', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns selected take ranges for the book, falling back to the anchor verse', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          granularity: 'verse',
          start_chapter: 0,
          start_verse: 0,
          end_chapter: 0,
          end_verse: 0,
          chapter_number: 14,
          verse_number: 3,
        },
        {
          granularity: 'pericope',
          start_chapter: 14,
          start_verse: 1,
          end_chapter: 14,
          end_verse: 11,
          chapter_number: 14,
          verse_number: 1,
        },
      ],
    });

    const coverages = await getSelectedTakeCoverages(1, 40);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('FROM recordings r'),
      [1, 40, 7],
    );
    expect(coverages).toEqual([
      {
        startChapter: 14,
        startVerse: 3,
        endChapter: 14,
        endVerse: 3,
      },
      {
        startChapter: 14,
        startVerse: 1,
        endChapter: 14,
        endVerse: 11,
      },
    ]);
  });
});
