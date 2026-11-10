import { ApiError } from '../types/api/errors';
import { logger } from '../utils/logger';
import { authToken } from './authToken';
import {
  authedConditionalGet,
  authedMultipartRequest,
  authedRequest,
  parseJsonResponse,
  publicRequest,
  publicRequestWithResponse,
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

// Pinned expo/fetch (SDK 57): only `credentials: 'omit'` gives OkHttp
// CookieJar.NO_COOKIES; unset and 'same-origin' become 'include', which routes
// the request and its response through the WebView CookieManager.
function usesWebViewCookieJar(init?: RequestInit): boolean {
  return (init?.credentials ?? 'include') !== 'omit';
}

describe('Fluent API transport is cookie-less', () => {
  const fetchMock = jest.fn();
  const okJson = (body: unknown, status = 200) => ({
    ok: status < 400,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    headers: { get: (name: string) => (name === 'ETag' ? '"v1"' : null) },
  });

  beforeEach(() => {
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
    authToken.set('global-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    authToken.set(null);
  });

  function lastInit(): RequestInit {
    return fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1];
  }

  it('public requests keep their headers without the cookie jar', async () => {
    fetchMock.mockResolvedValue(okJson({ ok: true }));

    await publicRequest('/bibles/7/bulk-texts', {
      method: 'POST',
      headers: { 'x-client-type': 'mobile' },
    });
    expect(usesWebViewCookieJar(lastInit())).toBe(false);
    expect(lastInit().headers).toEqual({
      'Content-Type': 'application/json',
      Origin: 'http://localhost:9999',
      'x-client-type': 'mobile',
    });

    await publicRequestWithResponse('/api/auth/sign-in/email', {
      method: 'POST',
    });
    expect(usesWebViewCookieJar(lastInit())).toBe(false);
  });

  it('authed requests carry only the captured bearer, never cookies', async () => {
    fetchMock.mockResolvedValue(okJson({ data: [] }));

    await authedRequest('/self/projects');
    expect(usesWebViewCookieJar(lastInit())).toBe(false);
    expect(lastInit().headers).toMatchObject({
      Authorization: 'Bearer global-token',
    });

    await authedRequest('/self/projects', undefined, 'captured-token');
    expect(usesWebViewCookieJar(lastInit())).toBe(false);
    expect(lastInit().headers).toMatchObject({
      Authorization: 'Bearer captured-token',
    });
  });

  it('a caller cannot opt a request back into the cookie jar', async () => {
    fetchMock.mockResolvedValue(okJson({ ok: true }));

    await authedRequest('/self/settings', { credentials: 'include' });
    expect(usesWebViewCookieJar(lastInit())).toBe(false);

    await publicRequest('/api/auth/forget-password', {
      credentials: 'same-origin',
    });
    expect(usesWebViewCookieJar(lastInit())).toBe(false);
  });

  it('conditional GETs keep 304 and ETag semantics without cookies', async () => {
    fetchMock.mockResolvedValueOnce(okJson(undefined, 304));

    await expect(
      authedConditionalGet('/pericope-sets/1', undefined, 'captured-token'),
    ).resolves.toEqual({ status: 304, etag: '"v1"' });
    expect(usesWebViewCookieJar(lastInit())).toBe(false);
    expect(lastInit().headers).toMatchObject({
      Authorization: 'Bearer captured-token',
    });
  });

  it('multipart uploads stay cookie-less and leave Content-Type to the runtime', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 1 }));

    await authedMultipartRequest(
      '/verse-audio',
      new FormData(),
      undefined,
      'owner-token',
    );
    expect(usesWebViewCookieJar(lastInit())).toBe(false);
    expect(lastInit().headers).toEqual({ Authorization: 'Bearer owner-token' });
    expect(lastInit().method).toBe('POST');
  });

  it('401 still surfaces as AuthError on the cookie-less transport', async () => {
    fetchMock.mockResolvedValue({
      ...okJson({ message: 'Invalid or revoked session token' }, 401),
    });

    await expect(authedRequest('/self/projects')).rejects.toMatchObject({
      name: 'AuthError',
    });
    expect(usesWebViewCookieJar(lastInit())).toBe(false);
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
    // Caller cancellation is an AbortError, not a network/timeout ApiError —
    // callers must not retry it or record it as a sync failure (#886).
    const assertion = expect(requestPromise).rejects.toMatchObject({
      name: 'AbortError',
    });

    callerController.abort();
    await assertion;
    await expect(requestPromise).rejects.not.toBeInstanceOf(ApiError);
  });

  it('rejects immediately with AbortError when the caller signal is already aborted', async () => {
    const callerController = new AbortController();
    callerController.abort();
    fetchMock.mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        }
      });
    });

    await expect(
      publicRequest('/slow-endpoint', { signal: callerController.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
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
