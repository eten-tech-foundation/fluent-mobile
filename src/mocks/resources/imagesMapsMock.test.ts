import { getMockImagesMaps } from './imagesMapsMock';

describe('imagesMapsMock', () => {
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
});
