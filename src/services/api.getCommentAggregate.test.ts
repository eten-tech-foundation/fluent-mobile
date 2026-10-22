jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';
import wireContract from './fixtures/chapterCommentAggregate.wire-contract.json';

describe('FluentAPI.getCommentAggregate', () => {
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

  it('GETs comment-aggregate with explicit token and no userId param', async () => {
    const payload = wireContract.examples.serviceUnitTestExtracted.payload;
    mockOkJson(payload);

    await expect(
      FluentAPI.getCommentAggregate(9, 'user-token'),
    ).resolves.toEqual(payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/chapter-assignments/9/comment-aggregate');
    expect(parsed.searchParams.has('userId')).toBe(false);
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer user-token',
      }),
    );
  });

  it('accepts verified zero/false payloads', async () => {
    const payload = wireContract.examples.schemaDerivedZeroFalse.payload;
    mockOkJson(payload);

    await expect(FluentAPI.getCommentAggregate(1, 'tok')).resolves.toEqual(
      payload,
    );
  });

  it('rejects chapterAssignmentId mismatch without coercing', async () => {
    mockOkJson({
      chapterAssignmentId: 8,
      commentCount: 4,
      currentUserHasCommented: false,
    });

    await expect(FluentAPI.getCommentAggregate(9, 'tok')).rejects.toMatchObject(
      {
        status: 500,
        message: expect.stringMatching(/Malformed chapter comment-aggregate/),
      },
    );
  });

  it('rejects invalid shapes', async () => {
    mockOkJson({
      chapterAssignmentId: 9,
      commentCount: 4,
    });

    await expect(FluentAPI.getCommentAggregate(9, 'tok')).rejects.toMatchObject(
      {
        status: 500,
      },
    );
  });

  it('rejects non-positive chapterAssignmentId before fetch', async () => {
    await expect(FluentAPI.getCommentAggregate(0, 'tok')).rejects.toMatchObject(
      {
        status: 400,
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
