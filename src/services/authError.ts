import { ApiError } from '../types/api/errors';

/** Session invalid or missing on an authenticated API request (HTTP 401). */
export class AuthError extends ApiError {
  constructor(message: string, code?: string) {
    super(401, message, code);
    this.name = 'AuthError';
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
