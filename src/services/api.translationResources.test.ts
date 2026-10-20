jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';

describe('FluentAPI translation-resources', () => {
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

  it.each([
    {
      kind: 'notes',
      load: FluentAPI.getTranslationNotes,
      body: {
        items: [
          {
            id: 101,
            name: 'Translation Note',
            localizedName: 'Note title',
            content: {
              type: 'doc',
              content: [{ type: 'text', text: 'Populated note body' }],
            },
          },
        ],
      },
    },
    {
      kind: 'questions',
      load: FluentAPI.getTranslationQuestions,
      body: {
        items: [
          {
            id: 102,
            name: 'Translation Question',
            localizedName: 'Question title',
            content: {
              type: 'doc',
              content: [
                { type: 'text', text: 'Populated question and answer' },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'images',
      load: FluentAPI.getTranslationImages,
      body: {
        items: [
          {
            id: 103,
            title: 'Reference map',
            localizedName: 'Map title',
            url: 'https://example.invalid/map.png',
            thumbnailUrl: 'https://example.invalid/map-thumb.png',
            caption: 'Map caption',
            attribution: 'Map author',
            licenseInfo: { title: 'CC BY 4.0' },
          },
        ],
      },
    },
  ])('preserves a populated $kind response intact', async ({ load, body }) => {
    mockOkJson(body);

    await expect(load(42, 'MRK', 1, 1, 'eng')).resolves.toEqual(body);
  });

  it('getTranslationNotes calls the notes path with languageCode', async () => {
    mockOkJson({ items: [] });

    await FluentAPI.getTranslationNotes(42, 'MRK', 1, 1, 'eng');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/projects/42/translation-resources/notes/MRK/1/1?languageCode=eng',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer session-abc',
        }),
      }),
    );
  });

  it('getTranslationQuestions calls the questions path with languageCode', async () => {
    mockOkJson({ items: [] });

    await FluentAPI.getTranslationQuestions(42, 'GEN', 2, 3, 'eng');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/projects/42/translation-resources/questions/GEN/2/3?languageCode=eng',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer session-abc',
        }),
      }),
    );
  });

  it('getTranslationImages encodes bookCode and languageCode', async () => {
    mockOkJson({ items: [] });

    await FluentAPI.getTranslationImages(7, '1SA', 1, 1, 'eng');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/projects/7/translation-resources/images/1SA/1/1?languageCode=eng',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer session-abc',
        }),
      }),
    );
  });
});
