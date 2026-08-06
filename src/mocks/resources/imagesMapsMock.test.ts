import {
  getMockImagesMaps,
  loadImagesMapsForUnit,
  setMockImagesMapsLoadFailure,
} from './imagesMapsMock';

describe('imagesMapsMock', () => {
  afterEach(() => {
    setMockImagesMapsLoadFailure(false);
  });

  it('returns no items when the shell hides Images & Maps', () => {
    expect(getMockImagesMaps(99, 1)).toEqual([]);
    expect(getMockImagesMaps(99, 3)).toEqual([]);
  });

  it('returns thumbnails with title and optional attribution', () => {
    const items = getMockImagesMaps(99, 2);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.title).toBeTruthy();
    expect(items[0]?.uri).toMatch(/^https:\/\//);
    expect(items.some(item => item.attribution)).toBe(true);
    expect(items.some(item => !item.attribution)).toBe(true);
  });

  it('throws when failure injection is enabled', async () => {
    setMockImagesMapsLoadFailure(true);
    await expect(loadImagesMapsForUnit(99, 2)).rejects.toThrow(
      /Failed to load Images & Maps/,
    );
  });
});
