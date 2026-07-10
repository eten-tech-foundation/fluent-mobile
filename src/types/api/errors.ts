/** Typed HTTP/API failure thrown by `httpClient` helpers. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
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
