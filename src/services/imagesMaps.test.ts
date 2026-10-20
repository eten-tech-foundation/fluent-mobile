import type { ApiTranslationImageItem } from '../types/api/translationResources';
import {
  formatImageLicenseAttribution,
  loadImagesMapsForUnit,
  parseTranslationImageItem,
  setImagesMapsLoadFailureForTests,
} from './imagesMaps';
import { FluentAPI } from './api';
import { ApiError } from './apiError';
import { findDownloadedRows } from './offlineResources';
import type { DownloadQueueItem } from '../types/download/types';

jest.mock('./api', () => ({
  FluentAPI: {
    getTranslationImages: jest.fn(),
  },
}));

jest.mock('./offlineResources', () => ({
  findDownloadedRows: jest.fn(),
}));

const mockFindRows = findDownloadedRows as jest.MockedFunction<
  typeof findDownloadedRows
>;

const getTranslationImages =
  FluentAPI.getTranslationImages as jest.MockedFunction<
    typeof FluentAPI.getTranslationImages
  >;

function downloadedRow(
  overrides: Partial<DownloadQueueItem> = {},
): DownloadQueueItem {
  return {
    id: '42-7-img-mrk-14',
    tier: 3,
    label: 'Jerusalem region map',
    progress: 1,
    status: 'completed',
    ...overrides,
  };
}

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
  beforeEach(() => {
    // Default: nothing downloaded → the API path is exercised.
    mockFindRows.mockResolvedValue(null);
  });

  afterEach(() => {
    setImagesMapsLoadFailureForTests(false);
    getTranslationImages.mockReset();
    mockFindRows.mockReset();
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

  it('rejects a 403 images fetch instead of resolving []', async () => {
    getTranslationImages.mockRejectedValue(new ApiError(403, 'Forbidden'));

    await expect(
      loadImagesMapsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 1,
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });
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

  describe('download-first', () => {
    it('uses downloaded images and skips the API, even when online', async () => {
      mockFindRows.mockResolvedValue([
        downloadedRow({ localFilePath: 'file:///downloads/map.png' }),
      ]);
      getTranslationImages.mockResolvedValue({ items: [sampleItem] });

      await expect(
        loadImagesMapsForUnit({
          projectId: 7,
          userId: 42,
          isOnline: true,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([
        {
          id: 'img-local-42-7-img-mrk-14',
          title: 'Jerusalem region map',
          uri: 'file:///downloads/map.png',
        },
      ]);
      expect(getTranslationImages).not.toHaveBeenCalled();
    });

    it('falls back to the API when nothing is downloaded and online', async () => {
      mockFindRows.mockResolvedValue(null);
      getTranslationImages.mockResolvedValue({ items: [sampleItem] });

      await expect(
        loadImagesMapsForUnit({
          projectId: 7,
          userId: 42,
          isOnline: true,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([
        {
          id: 'img-api-279999',
          title: 'Locations in the Book of Mark',
          uri: 'https://cdn.aquifer.bible/example.png',
          thumbnailUri: 'https://cdn.aquifer.bible/example-thumb.png',
        },
      ]);
      expect(getTranslationImages).toHaveBeenCalledTimes(1);
    });

    it('returns empty offline when nothing is downloaded (#578)', async () => {
      mockFindRows.mockResolvedValue(null);

      await expect(
        loadImagesMapsForUnit({
          projectId: 7,
          userId: 42,
          isOnline: false,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([]);
      expect(getTranslationImages).not.toHaveBeenCalled();
    });
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
