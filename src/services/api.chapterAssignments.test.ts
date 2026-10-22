jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';

describe('FluentAPI chapter assignment lists', () => {
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

  it('GETs /self/chapter-assignments/all and forwards the list queries', async () => {
    const payload = { syncedAt: '2026-10-12T00:00:00.000Z', data: [] };
    mockOkJson(payload);

    await expect(
      FluentAPI.getChapterAssignments(
        4,
        '2026-01-01T00:00:00.000Z',
        [97, 98],
        'user-token',
      ),
    ).resolves.toEqual(payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/self/chapter-assignments/all');
    expect(parsed.searchParams.get('updatedAfter')).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(parsed.searchParams.get('excludeProjectIds')).toBe('97,98');
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer user-token',
      }),
    );
  });

  it('GETs /self/chapter-assignments for the session user', async () => {
    const payload = { assignedChapters: [], peerCheckChapters: [] };
    mockOkJson(payload);

    await expect(FluentAPI.getUserChapterAssignments(4)).resolves.toEqual(
      payload,
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/self/chapter-assignments');
  });
});
