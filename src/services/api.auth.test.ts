jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { FluentAPI, setActiveToken } from './api';

describe('FluentAPI auth', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
    setActiveToken(null);
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
      json: async () => ({
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

  it('getUserProjects throws AuthError on 401 responses', async () => {
    setActiveToken('revoked-token');

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
});
