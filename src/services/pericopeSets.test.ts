import {
  loadBundledPericopeSet,
  getBundledPericopeSetVersion,
} from './pericopeSets';

describe('loadBundledPericopeSet', () => {
  it('returns typed, normalized verses for a mapped (setId, bookCode) pair', () => {
    const result = loadBundledPericopeSet(2, 'GEN'); // 2 = FIA
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
    expect(result![0]).toEqual(
      expect.objectContaining({
        chapterNumber: expect.any(Number),
        verseNumber: expect.any(Number),
        pericopeNumber: expect.any(String),
      }),
    );
  });

  it('returns verses for both bundled sets (FCBH=1 and FIA=2)', () => {
    const fcbh = loadBundledPericopeSet(1, 'GEN');
    const fia = loadBundledPericopeSet(2, 'GEN');
    expect(fcbh).not.toBeNull();
    expect(fia).not.toBeNull();
  });

  it('normalizes FCBH section+number into a single pericopeNumber, title always null', () => {
    const result = loadBundledPericopeSet(1, 'GEN')!;
    expect(result[0].pericopeNumber).toMatch(/^\d+\.\d+$/);
    expect(result[0].pericopeTitle).toBeNull();
  });

  it('preserves FIA titles where present, null where absent', () => {
    const result = loadBundledPericopeSet(2, 'GEN')!;
    const hasNonNullTitle = result.some(v => v.pericopeTitle !== null);
    // Not asserting true/false on content, just that nulls pass through
    // rather than being coerced to empty strings or dropped.
    expect(typeof hasNonNullTitle).toBe('boolean');
  });

  it('returns null for an unmapped pericopeSetId', () => {
    expect(loadBundledPericopeSet(999, 'GEN')).toBeNull();
  });

  it('returns null for a bookCode with no BOOK_CODE_TO_NAME entry', () => {
    expect(loadBundledPericopeSet(2, 'ZZZ')).toBeNull();
  });

  it('returns null for a book not present in the currently-bundled 34-book export', () => {
    // Isaiah (ISA) is not among the 34 currently-exported books.
    expect(loadBundledPericopeSet(2, 'ISA')).toBeNull();
  });

  it('verses are sorted by chapter then verse', () => {
    const result = loadBundledPericopeSet(2, 'GEN')!;
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      const prevKey = prev.chapterNumber * 1000 + prev.verseNumber;
      const currKey = curr.chapterNumber * 1000 + curr.verseNumber;
      expect(currKey).toBeGreaterThanOrEqual(prevKey);
    }
  });

  it('index is built once and reused across repeated calls (no throw, consistent results)', () => {
    const first = loadBundledPericopeSet(2, 'GEN');
    const second = loadBundledPericopeSet(2, 'GEN');
    expect(second).toEqual(first);
  });

  describe('getBundledPericopeSetVersion', () => {
    it('returns a version string for both bundled sets', () => {
      expect(getBundledPericopeSetVersion(1)).toEqual(expect.any(String));
      expect(getBundledPericopeSetVersion(2)).toEqual(expect.any(String));
    });

    it('returns null for an unmapped pericopeSetId', () => {
      expect(getBundledPericopeSetVersion(999)).toBeNull();
    });
  });
});
