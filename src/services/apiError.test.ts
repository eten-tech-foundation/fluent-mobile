import { parseApiErrorMessage } from './apiError';

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
