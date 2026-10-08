jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { buildHeaders, FluentAPI } from './api';
import { authToken } from './authToken';

describe('buildHeaders', () => {
  beforeEach(() => {
    authToken.set(null);
  });

  it('omits Authorization when no token is set', () => {
    expect(buildHeaders()).toEqual({ 'Content-Type': 'application/json' });
  });

  it('includes Authorization when a token is set', () => {
    authToken.set('session-abc');
    expect(buildHeaders()).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer session-abc',
    });
  });

  it('prefers an explicit bearer over the global token', () => {
    authToken.set('global-token');
    expect(buildHeaders(undefined, 'explicit-token')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer explicit-token',
    });
  });

  it('uses global token when explicit bearer is omitted', () => {
    authToken.set('global-token');
    expect(buildHeaders()).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer global-token',
    });
  });

  it('merges extra headers', () => {
    authToken.set('session-abc');
    expect(buildHeaders({ 'x-client-type': 'mobile' })).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer session-abc',
      'x-client-type': 'mobile',
    });
  });
});

describe('FluentAPI auth', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
    authToken.set(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signIn stores the full bearer token from set-auth-token', async () => {
    const fullToken = 'abc123.SQ1HRA9rZ32gWBmvsIfuA2B2Fa/EkGIgyfjv57iHlQU=';
    const encodedHeader =
      'abc123.SQ1HRA9rZ32gWBmvsIfuA2B2Fa%2FEkGIgyfjv57iHlQU%3D';

    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          token: 'abc123',
          user: { email: 't@fluent.local' },
        }),
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'set-auth-token' ? encodedHeader : null,
      },
    });

    const response = await FluentAPI.signIn('t@fluent.local', 't@123456');

    expect(response.token).toBe(fullToken);
  });

  it('signIn throws a stable error when the failure body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    });

    await expect(
      FluentAPI.signIn('t@fluent.local', 'wrong'),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: 'API failed: 503',
    });
  });

  it('getUserProjects throws AuthError on 401 responses', async () => {
    authToken.set('revoked-token');

    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({ message: 'Invalid or revoked session token' }),
    });

    await expect(FluentAPI.getUserProjects(2)).rejects.toMatchObject({
      name: 'AuthError',
      message: 'Invalid or revoked session token',
    });
  });

  it.each([
    ['getLanguages', '/languages', []],
    ['getBooks', '/books', []],
    ['getBibles', '/bibles', []],
  ] as const)(
    '%s sends Authorization bearer and throws AuthError on 401',
    async (method, path, okBody) => {
      authToken.set('catalog-token');
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(okBody),
        headers: { get: () => null },
      });

      await FluentAPI[method]();

      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:9999${path}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer catalog-token',
          }),
        }),
      );

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'User not authenticated' }),
      });

      await expect(FluentAPI[method]()).rejects.toMatchObject({
        name: 'AuthError',
        message: 'User not authenticated',
      });
    },
  );

  it('getPericopeSets sends Authorization bearer', async () => {
    authToken.set('catalog-token');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [] }),
      headers: { get: () => null },
    });

    await FluentAPI.getPericopeSets();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/pericope-sets',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer catalog-token',
        }),
      }),
    );
  });

  it('catalog methods prefer an explicit bearer over the global token', async () => {
    authToken.set('global-token');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([]),
      headers: { get: () => null },
    });

    await FluentAPI.getLanguages('explicit-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/languages',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer explicit-token',
        }),
      }),
    );
  });
});
