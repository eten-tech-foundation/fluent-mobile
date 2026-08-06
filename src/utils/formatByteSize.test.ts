import { formatByteSize } from './formatByteSize';

describe('formatByteSize', () => {
  it('returns 0 B for non-finite or non-positive values', () => {
    expect(formatByteSize(0)).toBe('0 B');
    expect(formatByteSize(-1)).toBe('0 B');
    expect(formatByteSize(Number.NaN)).toBe('0 B');
    expect(formatByteSize(Number.POSITIVE_INFINITY)).toBe('0 B');
  });

  it('formats megabytes for typical download totals', () => {
    expect(formatByteSize(318 * 1024 * 1024)).toBe('318 MB');
  });
});
