export class AuthError extends Error {
  readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
