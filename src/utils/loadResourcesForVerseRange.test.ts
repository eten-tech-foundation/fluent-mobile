import {
  loadResourcesForVerseRange,
  normalizeVerseRefs,
  verseNumbersKey,
  verseRefsFromChapter,
  verseRefsKey,
} from './loadResourcesForVerseRange';

describe('verseNumbersKey', () => {
  it('sorts and dedupes', () => {
    expect(verseNumbersKey([3, 1, 3, 2])).toBe('1,2,3');
  });
});

describe('verseRefsKey / normalizeVerseRefs', () => {
  it('sorts by chapter then verse and dedupes', () => {
    expect(
      verseRefsKey([
        { chapterNumber: 2, verseNumber: 1 },
        { chapterNumber: 1, verseNumber: 3 },
        { chapterNumber: 1, verseNumber: 1 },
        { chapterNumber: 1, verseNumber: 3 },
      ]),
    ).toBe('1:1,1:3,2:1');
  });

  it('drops invalid refs', () => {
    expect(
      normalizeVerseRefs([
        { chapterNumber: 0, verseNumber: 1 },
        { chapterNumber: 1, verseNumber: -1 },
        { chapterNumber: 1, verseNumber: 2 },
      ]),
    ).toEqual([{ chapterNumber: 1, verseNumber: 2 }]);
  });
});

describe('verseRefsFromChapter', () => {
  it('maps verseNumbers onto one chapter', () => {
    expect(verseRefsFromChapter(14, 1, [2, 3])).toEqual([
      { chapterNumber: 14, verseNumber: 2 },
      { chapterNumber: 14, verseNumber: 3 },
    ]);
  });
});

describe('loadResourcesForVerseRange', () => {
  it('loads a single verse without fan-out', async () => {
    const loadOne = jest.fn(async (ref: { verseNumber: number }) => [
      { id: `v${ref.verseNumber}` },
    ]);
    await expect(
      loadResourcesForVerseRange(
        [{ chapterNumber: 1, verseNumber: 4 }],
        loadOne,
      ),
    ).resolves.toEqual([{ id: 'v4' }]);
    expect(loadOne).toHaveBeenCalledTimes(1);
  });

  it('fans out and merges unique ids in verse order', async () => {
    const loadOne = jest.fn(async (ref: { verseNumber: number }) => {
      if (ref.verseNumber === 1) {
        return [{ id: 'shared' }, { id: 'a' }];
      }
      return [{ id: 'shared' }, { id: 'b' }];
    });

    await expect(
      loadResourcesForVerseRange(
        [
          { chapterNumber: 1, verseNumber: 2 },
          { chapterNumber: 1, verseNumber: 1 },
        ],
        loadOne,
      ),
    ).resolves.toEqual([{ id: 'shared' }, { id: 'a' }, { id: 'b' }]);
    expect(loadOne).toHaveBeenCalledTimes(2);
  });

  it('fans out across chapters', async () => {
    const loadOne = jest.fn(async (ref: { chapterNumber: number }) => [
      { id: `c${ref.chapterNumber}` },
    ]);

    await expect(
      loadResourcesForVerseRange(
        [
          { chapterNumber: 2, verseNumber: 1 },
          { chapterNumber: 1, verseNumber: 16 },
        ],
        loadOne,
      ),
    ).resolves.toEqual([{ id: 'c1' }, { id: 'c2' }]);
  });

  it('returns partial results when some verses fail', async () => {
    const loadOne = jest.fn(async (ref: { verseNumber: number }) => {
      if (ref.verseNumber === 2) {
        throw new Error('verse 2 failed');
      }
      return [{ id: `v${ref.verseNumber}` }];
    });

    await expect(
      loadResourcesForVerseRange(
        [
          { chapterNumber: 1, verseNumber: 1 },
          { chapterNumber: 1, verseNumber: 2 },
          { chapterNumber: 1, verseNumber: 3 },
        ],
        loadOne,
      ),
    ).resolves.toEqual([{ id: 'v1' }, { id: 'v3' }]);
  });

  it('throws when every verse fails', async () => {
    const loadOne = jest.fn(async () => {
      throw new Error('offline');
    });

    await expect(
      loadResourcesForVerseRange(
        [
          { chapterNumber: 1, verseNumber: 1 },
          { chapterNumber: 1, verseNumber: 2 },
        ],
        loadOne,
      ),
    ).rejects.toThrow('offline');
  });
});
