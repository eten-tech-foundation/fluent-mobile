import { formatTakeSubtitle } from './takeSubtitle';

describe('formatTakeSubtitle', () => {
  it('formats a verse take', () => {
    expect(
      formatTakeSubtitle({
        takeNumber: 1,
        granularity: 'verse',
        startChapter: 14,
        startVerse: 3,
        endChapter: 14,
        endVerse: 3,
      }),
    ).toBe('Take 1 - Verse - v. 3');
  });

  it('formats a same-chapter pericope take', () => {
    expect(
      formatTakeSubtitle({
        takeNumber: 2,
        granularity: 'pericope',
        startChapter: 14,
        startVerse: 3,
        endChapter: 14,
        endVerse: 7,
      }),
    ).toBe('Take 2 - Pericope - vv. 3-7');
  });

  it('formats a cross-chapter pericope take with chapter numbers', () => {
    expect(
      formatTakeSubtitle({
        takeNumber: 1,
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 30,
        endChapter: 2,
        endVerse: 5,
      }),
    ).toBe('Take 1 - Pericope - vv. 1:30-2:5');
  });

  it('formats a stitched row (#411)', () => {
    expect(
      formatTakeSubtitle({
        takeNumber: 3,
        granularity: 'stitched',
        startChapter: 14,
        startVerse: 3,
        endChapter: 14,
        endVerse: 5,
      }),
    ).toBe('Take 3 - Stitched - vv. 3-5');
  });

  it('formats a cross-chapter stitched row with chapter numbers', () => {
    expect(
      formatTakeSubtitle({
        takeNumber: 1,
        granularity: 'stitched',
        startChapter: 1,
        startVerse: 30,
        endChapter: 2,
        endVerse: 5,
      }),
    ).toBe('Take 1 - Stitched - vv. 1:30-2:5');
  });
});
