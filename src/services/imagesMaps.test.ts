import type { ApiTranslationImageItem } from '../types/api/translationResources';
import {
  loadImagesMapsForUnit,
  parseTranslationImageItem,
  setImagesMapsLoadFailureForTests,
} from './imagesMaps';
import { FluentAPI } from './api';

jest.mock('./api', () => ({
  FluentAPI: {
    getTranslationImages: jest.fn(),
  },
}));

const getTranslationImages =
  FluentAPI.getTranslationImages as jest.MockedFunction<
    typeof FluentAPI.getTranslationImages
  >;

const sampleItem: ApiTranslationImageItem = {
  id: 279999,
  title: 'Locations in the Book of Mark',
  localizedName: 'Locations in the Book of Mark',
  url: 'https://cdn.aquifer.bible/example.png',
  thumbnailUrl: 'https://cdn.aquifer.bible/example-thumb.png',
  size: 1024,
};

describe('parseTranslationImageItem', () => {
  it('maps API image items to Resources items', () => {
    expect(parseTranslationImageItem(sampleItem)).toEqual({
      id: 'img-api-279999',
      title: 'Locations in the Book of Mark',
      uri: 'https://cdn.aquifer.bible/example.png',
    });
  });

  it('returns null when URL is missing', () => {
    expect(
      parseTranslationImageItem({
        ...sampleItem,
        url: '  ',
      }),
    ).toBeNull();
  });
});

describe('loadImagesMapsForUnit', () => {
  afterEach(() => {
    setImagesMapsLoadFailureForTests(false);
    getTranslationImages.mockReset();
  });

  it('returns [] when projectId is null', async () => {
    await expect(
      loadImagesMapsForUnit({
        projectId: null,
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getTranslationImages).not.toHaveBeenCalled();
  });

  it('returns [] when bookCode is missing', async () => {
    await expect(
      loadImagesMapsForUnit({
        projectId: 7,
        bookCode: '',
        chapterNumber: 1,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getTranslationImages).not.toHaveBeenCalled();
  });

  it('returns [] when API has no images for the verse', async () => {
    getTranslationImages.mockResolvedValue({ items: [] });

    await expect(
      loadImagesMapsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getTranslationImages).toHaveBeenCalledTimes(1);
  });

  it('calls FluentAPI and maps image items', async () => {
    getTranslationImages.mockResolvedValue({ items: [sampleItem] });

    await expect(
      loadImagesMapsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 1,
      }),
    ).resolves.toEqual([
      {
        id: 'img-api-279999',
        title: 'Locations in the Book of Mark',
        uri: 'https://cdn.aquifer.bible/example.png',
      },
    ]);

    expect(getTranslationImages).toHaveBeenCalledWith(7, 'MRK', 1, 1, 'eng');
  });

  it('throws when failure injection is enabled', async () => {
    setImagesMapsLoadFailureForTests(true);
    await expect(
      loadImagesMapsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 1,
      }),
    ).rejects.toThrow(/Failed to load Images & Maps/);
  });
});
