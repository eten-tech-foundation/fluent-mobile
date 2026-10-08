/** Typed HTTP/API failure thrown by `httpClient` helpers. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    code?: string,
    body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }

  /** Retry on server errors and network failures (status 0). */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }

  /** Client errors that should not be retried (excluding 401, handled separately). */
  get isTerminal(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isRetryableApiError(error: unknown): boolean {
  return isApiError(error) && error.isRetryable;
}

const TRANSIENT_TRANSPORT_MESSAGE =
  /unable to resolve|enotfound|eai_again|network request failed|failed to fetch|request timed out|timed out|\btimeout\b|network error|^network$|offline|internet disconnected|socketexception/i;

/**
 * Offline, DNS, timeout, and other connectivity failures. These should not be
 * stored as persistent metadata sync step errors on the Sync page.
 */
export function isTransientTransportFailure(error: unknown): boolean {
  if (isApiError(error)) {
    return error.status === 0;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === 'AbortError') {
    return true;
  }
  return TRANSIENT_TRANSPORT_MESSAGE.test(error.message);
}
