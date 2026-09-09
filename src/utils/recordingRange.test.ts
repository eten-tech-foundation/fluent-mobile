import {
  hasUsableRecordingRange,
  rangeCoversVerse,
  rangesOverlap,
  shouldClearSelectionForIncomingTake,
} from './recordingRange';

describe('recordingRange', () => {
  const pericope37 = {
    startChapter: 1,
    startVerse: 3,
    endChapter: 1,
    endVerse: 7,
  };

  it('treats 0-stub ranges as unusable', () => {
    expect(
      hasUsableRecordingRange({
        startChapter: 0,
        startVerse: 0,
        endChapter: 0,
        endVerse: 0,
      }),
    ).toBe(false);
  });

  it('covers verses inside a same-chapter pericope range', () => {
    expect(rangeCoversVerse(pericope37, 1, 3)).toBe(true);
    expect(rangeCoversVerse(pericope37, 1, 5)).toBe(true);
    expect(rangeCoversVerse(pericope37, 1, 7)).toBe(true);
    expect(rangeCoversVerse(pericope37, 1, 2)).toBe(false);
    expect(rangeCoversVerse(pericope37, 1, 8)).toBe(false);
  });

  it('overlaps a verse take inside the pericope', () => {
    const verse5 = {
      startChapter: 1,
      startVerse: 5,
      endChapter: 1,
      endVerse: 5,
    };
    expect(rangesOverlap(pericope37, verse5)).toBe(true);
    expect(
      rangesOverlap(verse5, {
        startChapter: 1,
        startVerse: 8,
        endChapter: 1,
        endVerse: 8,
      }),
    ).toBe(false);
  });

  it('clears selection on the same bible_text_id even without a usable range', () => {
    expect(
      shouldClearSelectionForIncomingTake(
        {
          id: 'a',
          bibleTextId: 10,
          range: {
            startChapter: 0,
            startVerse: 0,
            endChapter: 0,
            endVerse: 0,
          },
        },
        {
          bibleTextId: 10,
          range: {
            startChapter: 0,
            startVerse: 0,
            endChapter: 0,
            endVerse: 0,
          },
        },
      ),
    ).toBe(true);
  });

  it('clears overlapping pericope vs verse takes on different bible_text_ids', () => {
    expect(
      shouldClearSelectionForIncomingTake(
        {
          id: 'verse5',
          bibleTextId: 105,
          range: {
            startChapter: 1,
            startVerse: 5,
            endChapter: 1,
            endVerse: 5,
          },
        },
        {
          id: 'peri',
          bibleTextId: 103,
          range: pericope37,
        },
      ),
    ).toBe(true);
  });
});
