import { sourceWindow, windowProgress, windowSeekMs } from './sourceWindow';

const verses = [
  { chapterNumber: 14, verseNumber: 22, text: 'a' },
  { chapterNumber: 14, verseNumber: 23, text: 'b' },
];
const stamps = [
  { verse: 21, startSeconds: 10 },
  { verse: 22, startSeconds: 20 },
  { verse: 23, startSeconds: 30 },
  { verse: 24, startSeconds: 40 },
];

describe('sourceWindow', () => {
  it('runs from the first verse to where the verse after the last starts', () => {
    expect(sourceWindow(verses, 14, stamps, undefined, 100000)).toEqual({
      startMs: 20000,
      endMs: 40000,
    });
  });

  it('runs to the end of the file when the passage ends the chapter', () => {
    expect(
      sourceWindow(verses, 14, stamps.slice(0, 3), undefined, 100000),
    ).toEqual({ startMs: 20000, endMs: 100000 });
  });

  it('ignores verses from another chapter', () => {
    const spanning = [
      ...verses,
      { chapterNumber: 15, verseNumber: 1, text: '' },
    ];
    expect(sourceWindow(spanning, 14, stamps, undefined, 100000)).toEqual({
      startMs: 20000,
      endMs: 40000,
    });
  });

  it('is null without timestamps or a length, so the chapter stands in', () => {
    expect(sourceWindow(verses, 14, undefined, undefined, 100000)).toBeNull();
    expect(sourceWindow(verses, 14, [], undefined, 100000)).toBeNull();
    expect(sourceWindow(verses, 14, stamps, undefined, 0)).toBeNull();
    expect(sourceWindow(verses, 15, stamps, undefined, 100000)).toBeNull();
  });
});

describe('windowProgress and windowSeekMs', () => {
  const window = { startMs: 20000, endMs: 40000 };

  it('measure through the window, clamped to it', () => {
    expect(windowProgress(30000, 100000, window)).toBe(0.5);
    expect(windowProgress(5000, 100000, window)).toBe(0);
    expect(windowProgress(90000, 100000, window)).toBe(1);
    expect(windowSeekMs(0.25, 100000, window)).toBe(25000);
  });

  it('measure through the chapter without a window', () => {
    expect(windowProgress(25000, 100000, null)).toBe(0.25);
    expect(windowProgress(0, 0, null)).toBe(0);
    expect(windowSeekMs(0.5, 100000, null)).toBe(50000);
  });
});
