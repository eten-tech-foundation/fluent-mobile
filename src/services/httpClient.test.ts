import { ApiError } from '../types/api/errors';
import { logger } from '../utils/logger';
import {
  parseJsonResponse,
  publicRequest,
  summarizeApiErrorResponse,
} from './httpClient';
import {
  HTTP_PHASE,
  SYNC_PHASE_FIELDS,
  SYNC_PHASE_LOG_MESSAGE,
} from './syncPhaseTiming';

describe('summarizeApiErrorResponse', () => {
  it('includes status and content length metadata', () => {
    expect(summarizeApiErrorResponse(503, '{"message":"down"}')).toEqual({
      status: 503,
      contentLength: 18,
    });
  });

  it('extracts string error codes from JSON bodies', () => {
    expect(
      summarizeApiErrorResponse(
        401,
        JSON.stringify({ code: 'AUTH_EXPIRED', message: 'Invalid session' }),
      ),
    ).toEqual({
      status: 401,
      contentLength: 51,
      errorCode: 'AUTH_EXPIRED',
    });
  });

  it('omits response content for non-JSON bodies', () => {
    expect(summarizeApiErrorResponse(500, 'plain text failure')).toEqual({
      status: 500,
      contentLength: 18,
    });
  });
});

describe('parseJsonResponse', () => {
  function mockResponse(body: string): Response {
    return {
      text: async () => body,
    } as Response;
  }

  it('returns an empty object for blank bodies', async () => {
    await expect(parseJsonResponse(mockResponse(''))).resolves.toEqual({});
    await expect(parseJsonResponse(mockResponse('   \n  '))).resolves.toEqual(
      {},
    );
  });

  it('parses valid JSON bodies', async () => {
    await expect(
      parseJsonResponse<{ ok: boolean }>(mockResponse('{"ok":true}')),
    ).resolves.toEqual({ ok: true });
  });

  it('throws a network ApiError for malformed non-empty bodies', async () => {
    await expect(parseJsonResponse(mockResponse('{not-json'))).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 0,
      }),
    );
  });
});

describe('publicRequest', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    logger.reset();
  });

  it('aborts when the request exceeds the timeout', async () => {
    jest.useFakeTimers();

    fetchMock.mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });

    const requestPromise = publicRequest('/slow-endpoint');
    const assertion = expect(requestPromise).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: 'Request timed out',
    });

    await jest.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('preserves a caller-provided AbortSignal', async () => {
    const callerController = new AbortController();

    fetchMock.mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });

    const requestPromise = publicRequest('/slow-endpoint', {
      signal: callerController.signal,
    });
    const assertion = expect(requestPromise).rejects.toBeInstanceOf(ApiError);

    callerController.abort();
    await assertion;
  });

  it('surfaces malformed JSON response bodies as network errors', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '{not-json',
    });

    await expect(publicRequest('/broken-json')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
    });
  });

  it('times network and parse separately without logging URLs or bodies', async () => {
    const transport = jest.fn();
    logger.setTransport(transport);
    const now = jest.spyOn(Date, 'now');
    now
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_040)
      .mockReturnValueOnce(1_040)
      .mockReturnValueOnce(1_090);

    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '{"ok":true,"email":"user@example.com"}',
    });

    try {
      await expect(publicRequest('/bibles/1/bulk-texts')).resolves.toEqual({
        ok: true,
        email: 'user@example.com',
      });
    } finally {
      logger.reset();
    }

    const phases = transport.mock.calls
      .filter(
        ([, tag, message]) =>
          tag === 'SyncPhase' && message === SYNC_PHASE_LOG_MESSAGE,
      )
      .map(([, , , context]) => context as Record<string, unknown>);

    expect(phases).toEqual([
      { phase: HTTP_PHASE.network, elapsedMs: 40 },
      { phase: HTTP_PHASE.parse, elapsedMs: 50 },
    ]);
    const serialized = JSON.stringify(phases);
    expect(serialized).not.toMatch(
      /bulk-texts|user@example\.com|Authorization|Bearer/i,
    );
    for (const context of phases) {
      expect(
        Object.keys(context).every(key =>
          (SYNC_PHASE_FIELDS as readonly string[]).includes(key),
        ),
      ).toBe(true);
    }
  });
});
