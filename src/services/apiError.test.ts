import {
  createApiError,
  parseApiErrorBody,
  parseApiErrorMessage,
} from './apiError';

describe('parseApiErrorBody', () => {
  it('extracts message and code from JSON error bodies', () => {
    expect(
      parseApiErrorBody(
        JSON.stringify({ message: 'Invalid session', code: 'AUTH_EXPIRED' }),
      ),
    ).toEqual({ message: 'Invalid session', code: 'AUTH_EXPIRED' });
  });

  it('falls back to raw body text for non-JSON responses', () => {
    expect(parseApiErrorBody('plain text error')).toEqual({
      message: 'plain text error',
      code: undefined,
    });
  });

  it('uses errorCode when code is absent', () => {
    expect(
      parseApiErrorBody(
        JSON.stringify({
          message: 'Invalid session',
          errorCode: 'AUTH_EXPIRED',
        }),
      ),
    ).toEqual({ message: 'Invalid session', code: 'AUTH_EXPIRED' });
  });
});

describe('createApiError', () => {
  it('uses a stable status fallback when the body is empty', () => {
    const error = createApiError(500, '');
    expect(error.message).toBe('API failed: 500');
    expect(error.status).toBe(500);
  });

  it('preserves server-provided messages', () => {
    const error = createApiError(
      401,
      JSON.stringify({ message: 'Invalid or revoked session token' }),
    );
    expect(error.message).toBe('Invalid or revoked session token');
  });
});

describe('parseApiErrorMessage', () => {
  it('extracts message from JSON error bodies', () => {
    expect(
      parseApiErrorMessage(
        401,
        JSON.stringify({ message: 'Invalid or revoked session token' }),
      ),
    ).toBe('Invalid or revoked session token');
  });

  it('falls back to a generic status message for empty bodies', () => {
    expect(parseApiErrorMessage(500, '')).toBe('API failed: 500');
  });
});
