jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';

describe('FluentAPI.getUserMilestones', () => {
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

  it('GETs /users/{userId}/milestones with the session bearer', async () => {
    const payload = [
      {
        id: 12,
        name: 'Mark',
        projectId: 3,
        projectName: 'Baka NT',
        milestoneCount: 2,
      },
    ];
    mockOkJson(payload);

    await expect(FluentAPI.getUserMilestones(247)).resolves.toEqual(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/247/milestones');
    expect(url).not.toContain('/projects');
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer session-abc',
        'Content-Type': 'application/json',
      }),
    );
  });

  it('sends an explicit bearer instead of the global token', async () => {
    mockOkJson([]);

    await FluentAPI.getUserMilestones(8, 'user-token');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer user-token',
      }),
    );
  });
});
