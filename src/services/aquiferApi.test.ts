const mockGetAquiferApiBaseUrl = jest.fn();
const mockGetAquiferApiKey = jest.fn();

jest.mock('../config/aquiferApi', () => ({
  getAquiferApiBaseUrl: () => mockGetAquiferApiBaseUrl(),
  getAquiferApiKey: () => mockGetAquiferApiKey(),
}));

import { AquiferAPI } from './aquiferApi';

describe('AquiferAPI', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    mockGetAquiferApiBaseUrl.mockReturnValue('https://aquifer.test');
    mockGetAquiferApiKey.mockReturnValue('key-123');
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the api-key header to Aquifer', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([]),
    });

    await AquiferAPI.getLanguages();

    expect(fetchMock).toHaveBeenCalledWith('https://aquifer.test/languages', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'api-key': 'key-123',
      },
    });
  });

  it('builds resource search query params', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          totalItemCount: 0,
          returnedItemCount: 0,
          offset: 0,
          items: [],
        }),
    });

    await AquiferAPI.searchResources({
      bookCode: 'GEN',
      startChapter: 1,
      endChapter: 2,
      languageCode: 'eng',
      resourceCollectionCode: 'UWTranslationWords',
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://aquifer.test/resources/search?');
    expect(url).toContain('BookCode=GEN');
    expect(url).toContain('StartChapter=1');
    expect(url).toContain('EndChapter=2');
    expect(url).toContain('LanguageCode=eng');
    expect(url).toContain('ResourceCollectionCode=UWTranslationWords');
  });

  it('requests Bible text with audio metadata', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          bibleId: 9,
          bibleName: 'World English Bible',
          bibleAbbreviation: 'WEB',
          bookName: 'Genesis',
          bookCode: 'GEN',
          chapters: [],
        }),
    });

    await AquiferAPI.getBibleText(9, 'GEN', 1, 1);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/bibles/9/texts?');
    expect(url).toContain('BookCode=GEN');
    expect(url).toContain('shouldReturnAudioData=true');
  });
});
