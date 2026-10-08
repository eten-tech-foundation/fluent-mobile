import { authToken } from './authToken';
import { FluentAPI } from './api';

describe('FluentAPI.getPericopeSet', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    authToken.set('pericope-token');
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GETs /pericope-sets/{id}?bookCode= with bearer and returns 200 + etag', async () => {
    const groups = [
      {
        bookCode: 'MRK',
        pericopeNumber: '1',
        pericopeTitle: null,
        verses: [{ chapterNumber: 1, verseNumber: 1 }],
      },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(groups),
      headers: { get: (name: string) => (name === 'ETag' ? '"abc"' : null) },
    });

    const result = await FluentAPI.getPericopeSet(7, { bookCode: 'MRK' });

    expect(result).toEqual({ status: 200, data: groups, etag: '"abc"' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/pericope-sets/7?bookCode=MRK',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer pericope-token',
        }),
      }),
    );
  });

  it('sends If-None-Match and treats 304 as success (#587)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 304,
      text: async () => '',
      headers: { get: (name: string) => (name === 'ETag' ? '"abc"' : null) },
    });

    const result = await FluentAPI.getPericopeSet(7, {
      bookCode: 'MRK',
      etag: '"abc"',
    });

    expect(result).toEqual({ status: 304, etag: '"abc"' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/pericope-sets/7?bookCode=MRK',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer pericope-token',
          'If-None-Match': '"abc"',
        }),
      }),
    );
  });
});
