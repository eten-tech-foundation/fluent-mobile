const mockSearchResources = jest.fn();
const mockGetResourceDetails = jest.fn();
const mockGetBibles = jest.fn();
const mockGetBibleText = jest.fn();

jest.mock('./aquiferApi', () => ({
  AquiferAPI: {
    searchResources: (...args: unknown[]) => mockSearchResources(...args),
    getResourceDetails: (...args: unknown[]) => mockGetResourceDetails(...args),
    getBibles: (...args: unknown[]) => mockGetBibles(...args),
    getBibleText: (...args: unknown[]) => mockGetBibleText(...args),
  },
}));

import { buildPrepareOfflineResourceManifest } from './prepareOfflineResourceManifest';
import type { PrepareOfflineChapterRow } from '../types/prepareOffline/types';

function chapter(
  overrides: Partial<PrepareOfflineChapterRow> = {},
): PrepareOfflineChapterRow {
  return {
    id: 1,
    bookId: 1,
    bookCode: 'GEN',
    bookName: 'Genesis',
    chapterNumber: 1,
    assignedUserId: null,
    ...overrides,
  };
}

describe('buildPrepareOfflineResourceManifest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchResources.mockResolvedValue({
      totalItemCount: 1,
      returnedItemCount: 1,
      offset: 0,
      items: [
        {
          id: 101,
          name: 'faith',
          localizedName: 'Faith',
          mediaType: 'Text',
          languageCode: 'eng',
          grouping: {
            type: 'Guide',
            name: 'Translation Words',
            collectionTitle: 'Translation Words',
            collectionCode: 'UWTranslationWords',
          },
        },
      ],
    });
    mockGetResourceDetails.mockResolvedValue({
      id: 101,
      referenceId: 101,
      name: 'faith',
      localizedName: 'Faith',
      content: [{ tiptap: { type: 'doc', content: [] } }],
      grouping: { type: 'Guide', name: 'Guide', mediaType: 'Text' },
      language: {
        id: 1,
        code: 'eng',
        displayName: 'English',
        scriptDirection: 'LTR',
      },
    });
    mockGetBibles.mockResolvedValue([
      {
        id: 9,
        name: 'World English Bible',
        abbreviation: 'WEB',
        languageId: 1,
      },
    ]);
    mockGetBibleText.mockResolvedValue({
      bibleId: 9,
      bibleName: 'World English Bible',
      bibleAbbreviation: 'WEB',
      bookName: 'Genesis',
      bookCode: 'GEN',
      chapters: [
        { number: 1, verses: [{ number: 1, text: 'In the beginning' }] },
      ],
    });
  });

  it('builds tiered Aquifer items for selected chapters', async () => {
    const manifest = await buildPrepareOfflineResourceManifest({
      projectId: 5,
      sourceLanguageCode: 'eng',
      chapters: [chapter()],
    });

    expect(mockSearchResources).toHaveBeenCalledWith(
      expect.objectContaining({
        bookCode: 'GEN',
        startChapter: 1,
        endChapter: 1,
        languageCode: 'eng',
        resourceCollectionCode: 'UWTranslationNotes',
      }),
    );
    expect(mockSearchResources).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'Images' }),
    );
    expect(mockGetBibles).toHaveBeenCalledWith('eng');
    expect(mockGetBibleText).toHaveBeenCalledWith(9, 'GEN', 1, 1);

    expect(manifest.projectId).toBe(5);
    expect(manifest.sourceLanguageCode).toBe('eng');
    expect(manifest.items[0]).toMatchObject({
      tier: 2,
      resourceName: 'Translation Notes',
      required: true,
      removable: false,
      fileExt: 'json',
    });
    expect(
      manifest.items.some(
        item => item.resourceName === 'Alternate Translations',
      ),
    ).toBe(true);
    expect(manifest.totalBytes).toBeGreaterThan(0);
  });

  it('keeps non-contiguous chapters in separate Aquifer ranges', async () => {
    await buildPrepareOfflineResourceManifest({
      projectId: 5,
      sourceLanguageCode: 'eng',
      chapters: [
        chapter({ chapterNumber: 1 }),
        chapter({ id: 2, chapterNumber: 3 }),
      ],
    });

    expect(mockSearchResources).toHaveBeenCalledWith(
      expect.objectContaining({ startChapter: 1, endChapter: 1 }),
    );
    expect(mockSearchResources).toHaveBeenCalledWith(
      expect.objectContaining({ startChapter: 3, endChapter: 3 }),
    );
  });
});
