import {
  flattenApiPericopeSetGroups,
  loadBundledPericopeSet,
  getBundledPericopeSetVersion,
  parseApiPericopeIdentity,
} from './pericopeSets';

describe('loadBundledPericopeSet', () => {
  it('returns typed, normalized verses for a mapped (setId, bookCode) pair', async () => {
    const result = await loadBundledPericopeSet(2, 'GEN'); // 2 = FIA
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

  it('returns verses for both bundled sets (FCBH=1 and FIA=2)', async () => {
    const fcbh = await loadBundledPericopeSet(1, 'GEN');
    const fia = await loadBundledPericopeSet(2, 'GEN');
    expect(fcbh).not.toBeNull();
    expect(fia).not.toBeNull();
  });

  it('normalizes FCBH section+number, with section carried separately and title always null', async () => {
    const result = (await loadBundledPericopeSet(1, 'GEN'))!;
    expect(result[0].pericopeNumber).toEqual(expect.any(String));
    expect(result[0].section).toEqual(expect.any(Number));
    expect(result[0].pericopeTitle).toBeNull();
  });

  it('preserves FIA titles where present and null where absent', async () => {
    const result = (await loadBundledPericopeSet(2, 'EXO'))!;
    const titled = result.find(
      v => v.chapterNumber === 1 && v.verseNumber === 1,
    );
    const untitled = result.find(
      v => v.chapterNumber === 1 && v.verseNumber === 8,
    );
    expect(titled?.pericopeTitle).toBe("The Israelite's slavery in Egypt");
    expect(untitled?.pericopeTitle).toBeNull();
  });

  it('returns null for an unmapped pericopeSetId', async () => {
    await expect(loadBundledPericopeSet(999, 'GEN')).resolves.toBeNull();
  });

  it('returns null for a bookCode with no BOOK_CODE_TO_NAME entry', async () => {
    await expect(loadBundledPericopeSet(2, 'ZZZ')).resolves.toBeNull();
  });

  it('returns null for a book not present in the currently-bundled 34-book export', async () => {
    // Isaiah (ISA) is not among the 34 currently-exported books.
    await expect(loadBundledPericopeSet(2, 'ISA')).resolves.toBeNull();
  });

  it('verses are sorted by chapter then verse', async () => {
    const result = (await loadBundledPericopeSet(2, 'GEN'))!;
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      const prevKey = prev.chapterNumber * 1000 + prev.verseNumber;
      const currKey = curr.chapterNumber * 1000 + curr.verseNumber;
      expect(currKey).toBeGreaterThanOrEqual(prevKey);
    }
  });

  it('index is built once and reused across repeated calls (no throw, consistent results)', async () => {
    const first = await loadBundledPericopeSet(2, 'GEN');
    const second = await loadBundledPericopeSet(2, 'GEN');
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

  describe('parseApiPericopeIdentity / flattenApiPericopeSetGroups', () => {
    it('splits FCBH section_number identity', () => {
      expect(parseApiPericopeIdentity('51_3')).toEqual({
        section: 51,
        pericopeNumber: '3',
      });
    });

    it('keeps FIA-style numbers without a section', () => {
      expect(parseApiPericopeIdentity('1.2')).toEqual({
        section: null,
        pericopeNumber: '1.2',
      });
    });

    it('flattens API groups into per-verse rows (#587)', () => {
      const verses = flattenApiPericopeSetGroups([
        {
          bookCode: 'MRK',
          pericopeNumber: '5_1',
          pericopeTitle: null,
          verses: [
            { chapterNumber: 1, verseNumber: 2 },
            { chapterNumber: 1, verseNumber: 1 },
          ],
        },
      ]);
      expect(verses).toEqual([
        {
          chapterNumber: 1,
          verseNumber: 1,
          section: 5,
          pericopeNumber: '1',
          pericopeTitle: null,
        },
        {
          chapterNumber: 1,
          verseNumber: 2,
          section: 5,
          pericopeNumber: '1',
          pericopeTitle: null,
        },
      ]);
    });
  });
});
