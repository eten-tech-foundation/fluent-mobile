import { authToken } from './authToken';

describe('authToken', () => {
  beforeEach(() => {
    authToken.set(null);
  });

  it('returns null when no token is set', () => {
    expect(authToken.get()).toBeNull();
  });

  it('stores and returns a token', () => {
    authToken.set('session-abc');
    expect(authToken.get()).toBe('session-abc');
  });

  it('clears a previously set token', () => {
    authToken.set('session-abc');
    authToken.set(null);
    expect(authToken.get()).toBeNull();
  });
});
