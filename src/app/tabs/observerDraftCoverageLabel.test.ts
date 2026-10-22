import {
  formatCanonicalObserverDraftLabel,
  hasCompleteObserverCoverage,
  isWellOrderedObserverCoverage,
  type ObserverDraftAudioCoverage,
} from './observerDraftCoverageLabel';

function coverage(
  overrides: Partial<ObserverDraftAudioCoverage> &
    Pick<ObserverDraftAudioCoverage, 'granularity'>,
): ObserverDraftAudioCoverage {
  return {
    startChapter: 1,
    startVerse: 3,
    endChapter: 1,
    endVerse: 3,
    ...overrides,
  };
}

describe('observerDraftCoverageLabel', () => {
  it('treats nullish bounds as incomplete', () => {
    expect(
      hasCompleteObserverCoverage(
        coverage({
          granularity: 'pericope',
          endVerse: null,
        }),
      ),
    ).toBe(false);
  });

  it('null/undefined coverage uses neutral anchor with no Verse/Pericope claim', () => {
    expect(formatCanonicalObserverDraftLabel(3, null)).toBe(
      'Canonical draft - v. 3',
    );
    expect(formatCanonicalObserverDraftLabel(3, undefined)).toBe(
      'Canonical draft - v. 3',
    );
    expect(formatCanonicalObserverDraftLabel(3, null)).not.toMatch(/Verse/);
    expect(formatCanonicalObserverDraftLabel(3, null)).not.toMatch(/Pericope/);
  });

  it('partial pericope preserves granularity and says range unavailable (no Verse claim)', () => {
    const label = formatCanonicalObserverDraftLabel(
      3,
      coverage({
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 3,
        endChapter: null,
        endVerse: null,
      }),
    );
    expect(label).toBe('Canonical draft - Pericope - Range unavailable - v. 3');
    expect(label).not.toMatch(/Verse/);
    expect(label).not.toMatch(/vv\./);
  });

  it('formats complete verse with full verified bounds via formatTakeVerseSpan', () => {
    expect(
      formatCanonicalObserverDraftLabel(
        3,
        coverage({
          granularity: 'verse',
          startChapter: 1,
          startVerse: 3,
          endChapter: 1,
          endVerse: 3,
        }),
      ),
    ).toBe('Canonical draft - Verse - vv. 3-3');
  });

  it('formats same-chapter pericope with inclusive Legacy span', () => {
    expect(
      formatCanonicalObserverDraftLabel(
        3,
        coverage({
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 3,
          endChapter: 1,
          endVerse: 7,
        }),
      ),
    ).toBe('Canonical draft - Pericope - vv. 3-7');
  });

  it('formats cross-chapter pericope with chapter:verse bounds', () => {
    expect(
      formatCanonicalObserverDraftLabel(
        30,
        coverage({
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 30,
          endChapter: 2,
          endVerse: 5,
        }),
      ),
    ).toBe('Canonical draft - Pericope - vv. 1:30-2:5');
  });

  it('fail-closes reversed bounds to range unavailable without inventing a span', () => {
    expect(
      isWellOrderedObserverCoverage({
        startChapter: 2,
        startVerse: 5,
        endChapter: 1,
        endVerse: 30,
      }),
    ).toBe(false);

    const label = formatCanonicalObserverDraftLabel(
      5,
      coverage({
        granularity: 'pericope',
        startChapter: 2,
        startVerse: 5,
        endChapter: 1,
        endVerse: 30,
      }),
    );
    expect(label).toBe('Canonical draft - Pericope - Range unavailable - v. 5');
    expect(label).not.toMatch(/vv\./);
  });
});
