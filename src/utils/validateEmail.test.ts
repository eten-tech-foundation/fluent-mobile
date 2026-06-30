import { isValidEmail } from './validateEmail';

describe('isValidEmail', () => {
  it('accepts a standard email address', () => {
    expect(isValidEmail('t@fluent.local')).toBe(true);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(isValidEmail('')).toBe(false);
  });
});
