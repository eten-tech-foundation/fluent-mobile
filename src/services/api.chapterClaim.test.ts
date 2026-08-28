jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

describe('FluentAPI.claimChapterAssignment', () => {
  const fetchMock = jest.fn();
  let FluentAPI: typeof import('./api').FluentAPI;

  beforeEach(() => {
    jest.resetModules();
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);

    jest.doMock('./connectivity', () => ({
      checkServerReachable: jest.fn(),
    }));

    const { authToken: freshAuthToken } = require('./authToken') as {
      authToken: { set: (token: string | null) => void };
    };
    freshAuthToken.set('session-token');

    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: 5,
          assignedUserId: 99,
          status: 'draft',
          hasClaimConflict: false,
        }),
    });

    ({ FluentAPI } = require('./api') as typeof import('./api'));
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('POSTs to the claim endpoint', async () => {
    await expect(FluentAPI.claimChapterAssignment(5, 99)).resolves.toEqual({
      chapterAssignmentId: 5,
      assignedUserId: 99,
      status: 'draft',
      hasClaimConflict: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/chapter-assignments/5/claim');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer session-token',
        'Content-Type': 'application/json',
      }),
    );
  });
});
