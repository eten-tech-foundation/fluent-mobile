import { AuthError, isAuthError } from './authError';

describe('AuthError', () => {
  it('identifies auth errors by instanceof', () => {
    const error = new AuthError('Invalid or revoked session token');

    expect(isAuthError(error)).toBe(true);
    expect(error.status).toBe(401);
    expect(error.name).toBe('AuthError');
  });

  it('returns false for non-auth errors', () => {
    expect(isAuthError(new Error('network failed'))).toBe(false);
    expect(isAuthError('Invalid or revoked session token')).toBe(false);
  });
});
