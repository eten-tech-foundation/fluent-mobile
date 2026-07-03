import { formatDuration, verseReference } from './recordTabUtils';

describe('formatDuration', () => {
  it('formats zero as 00:00:00', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });

  it('formats elapsed milliseconds with centiseconds', () => {
    expect(formatDuration(65_420)).toBe('01:05:42');
  });

  it('clamps negative values to zero', () => {
    expect(formatDuration(-1)).toBe('00:00:00');
  });
});

describe('verseReference', () => {
  it('joins book, chapter, and verse', () => {
    expect(verseReference('Mark', 14, 3)).toBe('Mark 14:3');
  });
});
