export class NetworkError extends Error {
  cause?: unknown;

  constructor(
    message = 'Unable to connect. Please check your internet connection and try again.',
    cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}
