jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import {
  CHAPTER_CLAIM_API_STUBBED,
  chapterClaimPath,
  isChapterClaimApiStubbed,
} from './chapterClaimApi';

describe('chapterClaimApi helpers', () => {
  it('builds the POST claim path', () => {
    expect(chapterClaimPath(12)).toBe('/chapter-assignments/12/claim');
  });

  it('reports stubbed API while CHAPTER_CLAIM_API_STUBBED is true', () => {
    expect(CHAPTER_CLAIM_API_STUBBED).toBe(true);
    expect(isChapterClaimApiStubbed()).toBe(true);
  });
});

describe('FluentAPI.claimChapterAssignment', () => {
  const fetchMock = jest.fn();
  let mockClaimWarn: jest.Mock;
  let FluentAPI: typeof import('./api').FluentAPI;

  beforeEach(() => {
    jest.resetModules();
    mockClaimWarn = jest.fn();
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);

    jest.doMock('../utils/logger', () => ({
      logger: {
        create: () => ({
          warn: mockClaimWarn,
          info: jest.fn(),
          error: jest.fn(),
        }),
      },
    }));
    jest.doMock('./connectivity', () => ({
      checkServerReachable: jest.fn(),
    }));

    const { authToken: freshAuthToken } = require('./authToken') as {
      authToken: { set: (token: string | null) => void };
    };
    freshAuthToken.set('session-token');

    ({ FluentAPI } = require('./api') as typeof import('./api'));
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('returns typed mock while stubbed and does not call fetch', async () => {
    await expect(FluentAPI.claimChapterAssignment(5, 99)).resolves.toEqual({
      chapterAssignmentId: 5,
      assignedUserId: 99,
      status: 'draft',
      hasClaimConflict: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockClaimWarn).toHaveBeenCalledWith(
      'FluentAPI.claimChapterAssignment stubbed pending fluent-api#272',
      { chapterAssignmentId: 5, userId: 99 },
    );
  });

  it('POSTs to the claim endpoint when stub is disabled', async () => {
    jest.resetModules();
    jest.doMock('./chapterClaimApi', () => ({
      CHAPTER_CLAIM_API_STUBBED: false,
      isChapterClaimApiStubbed: () => false,
      chapterClaimPath: (id: number) => `/chapter-assignments/${id}/claim`,
    }));
    jest.doMock('./connectivity', () => ({
      checkServerReachable: jest.fn(),
    }));
    jest.doMock('../utils/logger', () => ({
      logger: {
        create: () => ({
          warn: mockClaimWarn,
          info: jest.fn(),
          error: jest.fn(),
        }),
      },
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

    const { FluentAPI: LiveFluentAPI } = require('./api') as {
      FluentAPI: typeof FluentAPI;
    };

    await expect(LiveFluentAPI.claimChapterAssignment(5, 99)).resolves.toEqual({
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
    expect(mockClaimWarn).not.toHaveBeenCalled();
  });
});
