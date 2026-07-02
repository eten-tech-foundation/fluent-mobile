import { getApiBaseUrl } from '../config/apiBaseUrl';
import { ApiError } from '../types/api/errors';
import { logger } from '../utils/logger';
import { authToken } from './authToken';
import { createApiError, createNetworkApiError } from './apiError';
import { AuthError } from './authError';

const log = logger.create('HTTP');

const API_ERROR_BODY_LOG_LIMIT = 200;

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
    if (typeof parsed.message === 'string') {
      metadata.message = parsed.message.slice(0, API_ERROR_BODY_LOG_LIMIT);
    }
    const errorCode = parsed.code ?? parsed.errorCode;
    if (typeof errorCode === 'string') {
      metadata.errorCode = errorCode;
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

async function parseJsonResponse<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
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

async function executeRequest<T>(
  endpoint: string,
  options: RequestInit,
  auth: boolean,
  logLabel: string,
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${apiBaseUrl}${endpoint}`, options);

    if (!res.ok) {
      await handleErrorResponse(res, logLabel, auth);
    }

    return parseJsonResponse<T>(res);
  } catch (error) {
    if (error instanceof AuthError || error instanceof ApiError) {
      throw error;
    }

    throw createNetworkApiError(error);
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
  );
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
  );
}
