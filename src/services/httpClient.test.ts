import { ApiError } from '../types/api/errors';
import {
  parseJsonResponse,
  publicRequest,
  summarizeApiErrorResponse,
} from './httpClient';

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
});
