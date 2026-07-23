import { getApiBaseUrl } from '../config/apiBaseUrl';
import { ApiError } from '../types/api/errors';
import { logger } from '../utils/logger';
import { authToken } from './authToken';
import { createApiError, createNetworkApiError } from './apiError';
import { AuthError } from './authError';

const log = logger.create('HTTP');

const API_ERROR_BODY_LOG_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 30_000;

export interface HttpResponse<T> {
  data: T;
  response: Response;
}

export function summarizeApiErrorResponse(
  status: number,
  body: string,
): Record<string, number | string> {
  const metadata: Record<string, number | string> = {
    status,
    contentLength: body.length,
  };

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const errorCode = parsed.code ?? parsed.errorCode;
    if (typeof errorCode === 'string') {
      metadata.errorCode = errorCode.slice(0, API_ERROR_BODY_LOG_LIMIT);
    }
  } catch {
    // Non-JSON bodies are omitted from logs to avoid leaking response content.
  }

  return metadata;
}

/** Builds authenticated request headers; synchronous and testable. */
export function buildHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const token = authToken.get();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...extra,
  };
}

/**
 * Auth headers for multipart uploads. Omits `Content-Type` so the runtime
 * can set `multipart/form-data` with the correct boundary.
 */
export function buildMultipartAuthHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const token = authToken.get();
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...extra,
  };
}

export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const body = await res.text();
  if (!body.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw createNetworkApiError(error);
  }
}

async function handleErrorResponse(
  res: Response,
  logLabel: string,
  auth: boolean,
): Promise<never> {
  const errorBody = await res.text();
  log.error(logLabel, summarizeApiErrorResponse(res.status, errorBody));
  const apiError = createApiError(res.status, errorBody);

  if (auth && res.status === 401) {
    throw new AuthError(apiError.message, apiError.code);
  }

  throw apiError;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function executeRequest<T>(
  endpoint: string,
  options: RequestInit,
  auth: boolean,
  logLabel: string,
  apiBaseUrl = getApiBaseUrl(),
  returnResponse = false,
): Promise<T | HttpResponse<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const callerSignal = options.signal;
  const onCallerAbort = () => controller.abort();

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  try {
    const requestOptions = { ...options };
    delete requestOptions.signal;
    const res = await fetch(`${apiBaseUrl}${endpoint}`, {
      ...requestOptions,
      signal: controller.signal,
    });

    if (!res.ok) {
      await handleErrorResponse(res, logLabel, auth);
    }

    const data = await parseJsonResponse<T>(res);
    if (returnResponse) {
      return { data, response: res };
    }

    return data;
  } catch (error) {
    if (error instanceof AuthError || error instanceof ApiError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw createNetworkApiError(new Error('Request timed out'));
    }

    throw createNetworkApiError(error);
  } finally {
    clearTimeout(timeoutId);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }
}

export async function publicRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();

  return executeRequest<T>(
    endpoint,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Origin: apiBaseUrl,
        ...options?.headers,
      },
    },
    false,
    'Public API error',
    apiBaseUrl,
  ) as Promise<T>;
}

export async function publicRequestWithResponse<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<HttpResponse<T>> {
  const apiBaseUrl = getApiBaseUrl();

  return executeRequest<T>(
    endpoint,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Origin: apiBaseUrl,
        ...options?.headers,
      },
    },
    false,
    'Public API error',
    apiBaseUrl,
    true,
  ) as Promise<HttpResponse<T>>;
}

export async function authedRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  return executeRequest<T>(
    endpoint,
    {
      ...options,
      headers: { ...buildHeaders(), ...options?.headers },
    },
    true,
    'API error',
  ) as Promise<T>;
}

/** Authenticated multipart POST/PUT — do not set JSON Content-Type. */
export async function authedMultipartRequest<T>(
  endpoint: string,
  body: FormData,
  options?: Omit<RequestInit, 'body'>,
): Promise<T> {
  return executeRequest<T>(
    endpoint,
    {
      method: 'POST',
      ...options,
      body,
      headers: {
        ...buildMultipartAuthHeaders(),
        ...options?.headers,
      },
    },
    true,
    'API error',
  ) as Promise<T>;
}
