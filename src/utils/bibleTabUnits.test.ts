import {
  buildBibleUnits,
  formatSourceAudioUnitCaption,
  lastUnrecordedAnchorVerse,
  subdivisionTickMarks,
  unitContainsVerse,
  unitRecordedStatus,
} from './bibleTabUnits';
import type { VerseData } from '../types/db/types';

const verses: VerseData[] = [
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 1,
    text: 'v1',
  },
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 2,
    text: 'v2',
  },
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 3,
    text: 'v3',
  },
];

describe('formatSourceAudioUnitCaption', () => {
  it('labels verse mode as Verse i / n', () => {
    expect(
      formatSourceAudioUnitCaption({
        draftingUnit: 'verse',
        index: 3,
        total: 12,
      }),
    ).toBe('Verse 3 / 12');
  });

  it('labels pericope mode as Pericope i / n', () => {
    expect(
      formatSourceAudioUnitCaption({
        draftingUnit: 'pericope',
        index: 2,
        total: 5,
      }),
    ).toBe('Pericope 2 / 5');
  });
});

describe('buildBibleUnits', () => {
  it('builds one verse row per verse labeled by verse number', () => {
    const units = buildBibleUnits({
      draftingUnit: 'verse',
      verses,
      pericopes: [],
      chapterNumber: 14,
      chapterName: 'Mark 14',
      bookName: 'Mark',
    });
    expect(units).toHaveLength(3);
    expect(units.map(u => u.title)).toEqual(['1', '2', '3']);
    expect(units[1]?.anchorVerse).toBe(2);
  });

  it('builds one pericope card with a range title, never Pericope N', () => {
    const units = buildBibleUnits({
      draftingUnit: 'pericope',
      verses,
      pericopes: [
        {
          pericopeNumber: '1',
          pericopeTitle: 'Anointing',
          section: 1,
          verses: [
            { chapterNumber: 14, verseNumber: 1 },
            { chapterNumber: 14, verseNumber: 2 },
          ],
        },
        {
          pericopeNumber: '2',
          pericopeTitle: null,
          section: 1,
          verses: [{ chapterNumber: 14, verseNumber: 3 }],
        },
      ],
      chapterNumber: 14,
      chapterName: 'Mark 14',
      bookName: 'Mark',
    });
    expect(units).toHaveLength(2);
    expect(units[0]?.title).toBe('Mark 14:1–2');
    expect(units[1]?.title).toBe('Mark 14:3');
    expect(units.some(u => /Pericope \d/.test(u.title))).toBe(false);
    expect(units[0]?.anchorVerse).toBe(1);
  });

  it('titles a cross-chapter pericope with chapter numbers on both ends', () => {
    const units = buildBibleUnits({
      draftingUnit: 'pericope',
      verses,
      pericopes: [
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
      ],
      chapterNumber: 2,
      chapterName: 'Genesis 2',
      bookName: 'Genesis',
    });
    expect(units[0]?.title).toBe('Genesis 1:31–2:2');
    expect(units[0]?.anchorVerse).toBe(1);
  });
});

describe('unitContainsVerse', () => {
  const spanning = {
    verses: [
      { chapterNumber: 13, verseNumber: 2 },
      { chapterNumber: 14, verseNumber: 1 },
    ],
  };

  it('requires both chapter and verse, not verse number alone', () => {
    expect(unitContainsVerse(spanning, 14, 1)).toBe(true);
    expect(unitContainsVerse(spanning, 13, 2)).toBe(true);
    expect(unitContainsVerse(spanning, 14, 2)).toBe(false);
  });
});

describe('unitRecordedStatus', () => {
  const pericopeVerses = [
    { chapterNumber: 14, verseNumber: 1 },
    { chapterNumber: 14, verseNumber: 2 },
    { chapterNumber: 14, verseNumber: 3 },
  ];

  it('is recorded when every verse in the unit is covered', () => {
    expect(
      unitRecordedStatus(pericopeVerses, [
        {
          startChapter: 14,
          startVerse: 1,
          endChapter: 14,
          endVerse: 3,
        },
      ]),
    ).toBe('recorded');
  });

  it('is partial when only some verses are covered', () => {
    expect(
      unitRecordedStatus(pericopeVerses, [
        {
          startChapter: 14,
          startVerse: 1,
          endChapter: 14,
          endVerse: 1,
        },
      ]),
    ).toBe('partial');
  });

  it('is none when nothing covers the unit', () => {
    expect(unitRecordedStatus(pericopeVerses, [])).toBe('none');
  });
});

describe('lastUnrecordedAnchorVerse', () => {
  it('returns the last unit that is not fully recorded', () => {
    const units = buildBibleUnits({
      draftingUnit: 'verse',
      verses,
      pericopes: [],
      chapterNumber: 14,
      chapterName: 'Mark 14',
      bookName: 'Mark',
    });
    const verseTake = (verse: number) => ({
      startChapter: 14,
      startVerse: verse,
      endChapter: 14,
      endVerse: verse,
    });
    expect(lastUnrecordedAnchorVerse(units, [verseTake(1), verseTake(2)])).toBe(
      3,
    );
    expect(
      lastUnrecordedAnchorVerse(units, [
        verseTake(1),
        verseTake(2),
        verseTake(3),
      ]),
    ).toBeNull();
  });
});

describe('subdivisionTickMarks', () => {
  it('returns labeled verse-boundary marks when timestamps exist', () => {
    expect(
      subdivisionTickMarks({
        timestamps: [
          { verse: 1, startSeconds: 0 },
          { verse: 2, startSeconds: 4 },
          { verse: 3, startSeconds: 10 },
        ],
        durationMs: 20_000,
        boundaryVerses: [2, 3],
      }),
    ).toEqual([
      { verse: 2, ratio: 0.2 },
      { verse: 3, ratio: 0.5 },
    ]);
  });

  it('returns no ticks when timestamps or duration are missing', () => {
    expect(
      subdivisionTickMarks({
        timestamps: undefined,
        durationMs: 20_000,
        boundaryVerses: [2],
      }),
    ).toEqual([]);
    expect(
      subdivisionTickMarks({
        timestamps: [{ verse: 2, startSeconds: 4 }],
        durationMs: 0,
        boundaryVerses: [2],
      }),
    ).toEqual([]);
  });
});
