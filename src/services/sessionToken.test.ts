import { resolveSessionToken } from './sessionToken';

describe('resolveSessionToken', () => {
  it('prefers the URL-decoded set-auth-token header over the JSON body token', () => {
    const headerToken =
      'abc123.SQ1HRA9rZ32gWBmvsIfuA2B2Fa%2FEkGIgyfjv57iHlQU%3D';
    const bodyToken = 'abc123';

    expect(resolveSessionToken(headerToken, bodyToken)).toBe(
      'abc123.SQ1HRA9rZ32gWBmvsIfuA2B2Fa/EkGIgyfjv57iHlQU=',
    );
  });

  it('falls back to the body token when the header is missing', () => {
    expect(resolveSessionToken(null, 'session-from-body')).toBe(
      'session-from-body',
    );
  });

  it('returns undefined when neither header nor body token is present', () => {
    expect(resolveSessionToken(null, undefined)).toBeUndefined();
  });

  it('falls back to the body token when header decoding fails', () => {
    expect(resolveSessionToken('%E0%A4%A', 'session-from-body')).toBe(
      'session-from-body',
    );
  });
});
