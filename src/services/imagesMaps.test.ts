import type { ApiTranslationImageItem } from '../types/api/translationResources';
import {
  formatImageLicenseAttribution,
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
  it('maps API image items to Resources items with thumbnailUri (#594)', () => {
    expect(parseTranslationImageItem(sampleItem)).toEqual({
      id: 'img-api-279999',
      title: 'Locations in the Book of Mark',
      uri: 'https://cdn.aquifer.bible/example.png',
      thumbnailUri: 'https://cdn.aquifer.bible/example-thumb.png',
    });
  });

  it('maps caption and attribution when present (#594)', () => {
    expect(
      parseTranslationImageItem({
        ...sampleItem,
        caption: '  Map of the region  ',
        attribution: ' Aquifer Images ',
      }),
    ).toEqual({
      id: 'img-api-279999',
      title: 'Locations in the Book of Mark',
      uri: 'https://cdn.aquifer.bible/example.png',
      thumbnailUri: 'https://cdn.aquifer.bible/example-thumb.png',
      caption: 'Map of the region',
      attribution: 'Aquifer Images',
    });
  });

  it('derives attribution from licenseInfo when attribution is omitted (#594)', () => {
    expect(
      parseTranslationImageItem({
        ...sampleItem,
        licenseInfo: {
          title: 'CC BY-SA 4.0',
          copyright: { holder: { name: 'UnfoldingWord' }, dates: '2020' },
        },
      })?.attribution,
    ).toBe('CC BY-SA 4.0 · UnfoldingWord · 2020');
  });

  it('prefers explicit attribution over licenseInfo (#594)', () => {
    expect(
      parseTranslationImageItem({
        ...sampleItem,
        attribution: 'Explicit credit',
        licenseInfo: {
          title: 'CC BY-SA 4.0',
          copyright: { holder: { name: 'UnfoldingWord' }, dates: '2020' },
        },
      })?.attribution,
    ).toBe('Explicit credit');
  });

  it('omits thumbnailUri when thumbnailUrl matches url (#594)', () => {
    expect(
      parseTranslationImageItem({
        ...sampleItem,
        thumbnailUrl: sampleItem.url,
      }),
    ).toEqual({
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

describe('formatImageLicenseAttribution', () => {
  it('returns undefined for empty or non-object licenseInfo', () => {
    expect(formatImageLicenseAttribution(undefined)).toBeUndefined();
    expect(formatImageLicenseAttribution(null)).toBeUndefined();
    expect(formatImageLicenseAttribution('cc')).toBeUndefined();
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
        thumbnailUri: 'https://cdn.aquifer.bible/example-thumb.png',
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

  it('fans out across verseNumbers and dedupes by id (#593)', async () => {
    getTranslationImages.mockImplementation(async (_p, _b, _c, verse) => ({
      items: [
        {
          ...sampleItem,
          id: verse === 1 ? 100 : 200,
          title: `Image ${verse}`,
          localizedName: `Image ${verse}`,
        },
      ],
    }));

    const items = await loadImagesMapsForUnit({
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 1,
      verseNumber: 1,
      verseNumbers: [1, 2],
    });

    expect(getTranslationImages).toHaveBeenCalledTimes(2);
    expect(items.map(i => i.id)).toEqual(['img-api-100', 'img-api-200']);
  });
});
