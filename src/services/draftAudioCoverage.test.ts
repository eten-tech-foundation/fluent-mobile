import {
  coverageFromTake,
  isValidInclusiveCoverage,
} from './draftAudioCoverage';

describe('draftAudioCoverage', () => {
  it('returns null for older takes without coverage keys', () => {
    expect(
      coverageFromTake({
        /* granularity absent */
      }),
    ).toBeNull();
  });

  it('returns null when granularity is set but bound keys are missing', () => {
    expect(
      coverageFromTake({
        granularity: 'verse',
        // bounds undefined — do not invent nulls
      }),
    ).toBeNull();
  });

  it('reads exact take coverage without inventing bounds', () => {
    expect(
      coverageFromTake({
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 3,
        endChapter: 2,
        endVerse: 4,
      }),
    ).toEqual({
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 2,
      endVerse: 4,
    });
  });

  it('validates inclusive coverage ordering', () => {
    expect(
      isValidInclusiveCoverage({
        granularity: 'verse',
        startChapter: 1,
        startVerse: 3,
        endChapter: 1,
        endVerse: 3,
      }),
    ).toBe(true);
    expect(
      isValidInclusiveCoverage({
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 3,
        endChapter: 2,
        endVerse: 4,
      }),
    ).toBe(true);
    expect(
      isValidInclusiveCoverage({
        granularity: 'pericope',
        startChapter: 2,
        startVerse: 1,
        endChapter: 1,
        endVerse: 20,
      }),
    ).toBe(false);
    expect(
      isValidInclusiveCoverage({
        granularity: 'verse',
        startChapter: 1,
        startVerse: 5,
        endChapter: 1,
        endVerse: 4,
      }),
    ).toBe(false);
    expect(
      isValidInclusiveCoverage({
        granularity: 'verse',
        startChapter: 1,
        startVerse: null,
        endChapter: 1,
        endVerse: 3,
      }),
    ).toBe(false);
    expect(
      isValidInclusiveCoverage({
        granularity: 'verse',
        startChapter: 1.5,
        startVerse: 3,
        endChapter: 1,
        endVerse: 3,
      }),
    ).toBe(false);
    expect(
      isValidInclusiveCoverage({
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 3.25,
        endChapter: 2,
        endVerse: 4,
      }),
    ).toBe(false);
  });
});
