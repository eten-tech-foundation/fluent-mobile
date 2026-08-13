import type { AquiferResourceDetails } from '../types/api/aquifer';
import {
  loadImagesMapsForUnit,
  parseAquiferImagesMapsItem,
  setImagesMapsLoadFailureForTests,
} from './imagesMaps';
import { AquiferAPI } from './aquiferApi';

jest.mock('./aquiferApi', () => ({
  AquiferAPI: {
    searchResources: jest.fn(),
    getResourceDetails: jest.fn(),
  },
}));

const searchResources = AquiferAPI.searchResources as jest.MockedFunction<
  typeof AquiferAPI.searchResources
>;
const getResourceDetails = AquiferAPI.getResourceDetails as jest.MockedFunction<
  typeof AquiferAPI.getResourceDetails
>;

const sampleDetails: AquiferResourceDetails = {
  id: 279999,
  referenceId: 186419,
  name: 'Locations in the Book of Mark',
  localizedName: 'Locations in the Book of Mark',
  content: {
    url: 'https://cdn.aquifer.bible/example.png',
  },
  grouping: {
    type: 'Images',
    name: 'Maps (FIA)',
    mediaType: 'Image',
    licenseInfo: {
      title: 'Familiarization Maps',
      copyright: {
        holder: {
          name: 'Biblica Inc.',
        },
      },
    },
  },
  language: {
    id: 1,
    code: 'eng',
    displayName: 'English',
    scriptDirection: 'LTR',
  },
};

describe('parseAquiferImagesMapsItem', () => {
  it('maps Aquifer image details to Resources items', () => {
    expect(parseAquiferImagesMapsItem(sampleDetails)).toEqual({
      id: 'img-aquifer-279999',
      title: 'Locations in the Book of Mark',
      caption: 'Maps (FIA)',
      attribution: 'Biblica Inc.',
      uri: 'https://cdn.aquifer.bible/example.png',
    });
  });

  it('returns null when content URL is missing', () => {
    expect(
      parseAquiferImagesMapsItem({
        ...sampleDetails,
        content: {},
      }),
    ).toBeNull();
  });
});

describe('loadImagesMapsForUnit', () => {
  afterEach(() => {
    setImagesMapsLoadFailureForTests(false);
    searchResources.mockReset();
    getResourceDetails.mockReset();
  });

  it('returns [] when Aquifer has no images for the unit', async () => {
    searchResources.mockResolvedValue({
      totalItemCount: 0,
      returnedItemCount: 0,
      offset: 0,
      items: [],
    });

    await expect(
      loadImagesMapsForUnit({
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
  });

  it('searches Aquifer Images and maps resource details', async () => {
    searchResources.mockResolvedValue({
      totalItemCount: 1,
      returnedItemCount: 1,
      offset: 0,
      items: [
        {
          id: 279999,
          name: 'Locations in the Book of Mark',
          localizedName: 'Locations in the Book of Mark',
          mediaType: 'Image',
          languageCode: 'eng',
          grouping: {
            type: 'Images',
            name: 'Maps (FIA)',
            collectionTitle: 'Maps (FIA)',
            collectionCode: 'FIAMaps',
          },
        },
      ],
    });
    getResourceDetails.mockResolvedValue(sampleDetails);

    await expect(
      loadImagesMapsForUnit({
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 1,
      }),
    ).resolves.toEqual([
      {
        id: 'img-aquifer-279999',
        title: 'Locations in the Book of Mark',
        caption: 'Maps (FIA)',
        attribution: 'Biblica Inc.',
        uri: 'https://cdn.aquifer.bible/example.png',
      },
    ]);

    expect(searchResources).toHaveBeenCalledWith({
      bookCode: 'MRK',
      startChapter: 1,
      endChapter: 1,
      startVerse: 1,
      endVerse: 1,
      languageCode: 'eng',
      resourceType: 'Images',
      limit: 100,
    });
    expect(getResourceDetails).toHaveBeenCalledWith(279999);
  });

  it('throws when failure injection is enabled', async () => {
    setImagesMapsLoadFailureForTests(true);
    await expect(
      loadImagesMapsForUnit({
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 1,
      }),
    ).rejects.toThrow(/Failed to load Images & Maps/);
  });
});
