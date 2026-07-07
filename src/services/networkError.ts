export class NetworkError extends Error {
  constructor(
    message = 'Unable to connect. Please check your internet connection and try again.',
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}
