import { ApiError } from '../types/api/errors';

export interface ParsedApiErrorBody {
  message: string;
  code?: string;
}

export function parseApiErrorBody(body: string): ParsedApiErrorBody {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const rawCode = parsed.code ?? parsed.errorCode;
    const code = typeof rawCode === 'string' ? rawCode : undefined;
    if (typeof parsed.message === 'string') {
      return { message: parsed.message, code };
    }
  } catch {
    // fall through to raw body
  }

  return { message: body.trim(), code: undefined };
}

/** @deprecated Prefer `createApiError` for typed errors. Kept for existing call sites. */
export function parseApiErrorMessage(
  status: number,
  errorBody: string,
): string {
  const { message } = parseApiErrorBody(errorBody);
  return message || `API failed: ${status}`;
}

export function createApiError(status: number, errorBody: string): ApiError {
  const { message, code } = parseApiErrorBody(errorBody);
  return new ApiError(status, message || `API failed: ${status}`, code);
}

export function createNetworkApiError(cause: unknown): ApiError {
  const message =
    cause instanceof Error ? cause.message : 'Network request failed';
  return new ApiError(0, message);
}

export { ApiError, isApiError, isRetryableApiError } from '../types/api/errors';
