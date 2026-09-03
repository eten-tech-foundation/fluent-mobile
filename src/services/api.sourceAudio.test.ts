jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';

describe('FluentAPI source-audio', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
    authToken.set('session-abc');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    authToken.set(null);
  });

  function mockOkJson(body: unknown) {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    });
  }

  it('getChapterSourceAudio calls the chapter path with required query params', async () => {
    mockOkJson({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB', fluentBibleId: 9 },
      bookCode: 'MRK',
      chapter: 1,
      items: [],
    });

    const result = await FluentAPI.getChapterSourceAudio({
      projectId: 42,
      bookCode: 'MRK',
      chapter: 1,
      languageCode: 'eng',
      bibleId: 9,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/projects/42/source-audio/MRK/1?languageCode=eng&bibleId=9',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer session-abc',
        }),
      }),
    );
    expect(result.items).toEqual([]);
  });

  it('getChapterSourceAudio encodes bookCode and optional verse', async () => {
    mockOkJson({
      provider: 'dbl',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: '1SA',
      chapter: 2,
      verse: 3,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/a.mp3',
          scope: 'chapter',
        },
      ],
    });

    await FluentAPI.getChapterSourceAudio({
      projectId: 7,
      bookCode: '1SA',
      chapter: 2,
      languageCode: 'eng',
      bibleId: 11,
      verse: 3,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/projects/7/source-audio/1SA/2?languageCode=eng&bibleId=11&verse=3',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer session-abc',
        }),
      }),
    );
  });
});
