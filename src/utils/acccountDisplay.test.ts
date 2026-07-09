import { getAccountDisplayName, getAccountInitials } from './accountDisplay';

describe('getAccountDisplayName', () => {
  it('joins first and last name when both are present', () => {
    expect(
      getAccountDisplayName({ firstName: 'John', lastName: 'Smith' }),
    ).toBe('John Smith');
  });

  it('uses just the first name when last name is missing', () => {
    expect(getAccountDisplayName({ firstName: 'John' })).toBe('John');
  });

  it('uses just the last name when first name is missing', () => {
    expect(getAccountDisplayName({ lastName: 'Smith' })).toBe('Smith');
  });

  it('falls back to email when no name is present', () => {
    expect(getAccountDisplayName({ email: 'john.smith@example.com' })).toBe(
      'john.smith@example.com',
    );
  });

  it('trims whitespace-only names and falls back to email', () => {
    expect(
      getAccountDisplayName({
        firstName: '   ',
        lastName: '',
        email: 'john@example.com',
      }),
    ).toBe('john@example.com');
  });

  it('falls back to "Unknown account" when neither name nor email is present', () => {
    expect(getAccountDisplayName({})).toBe('Unknown account');
  });

  it('falls back to "Unknown account" when email is whitespace-only', () => {
    expect(getAccountDisplayName({ email: '   ' })).toBe('Unknown account');
  });

  it('prefers name over email when both are present', () => {
    expect(
      getAccountDisplayName({
        firstName: 'John',
        lastName: 'Smith',
        email: 'someone-else@example.com',
      }),
    ).toBe('John Smith');
  });
});

describe('getAccountInitials', () => {
  it('uses first letters of first and last name when both present', () => {
    expect(getAccountInitials({ firstName: 'John', lastName: 'Smith' })).toBe(
      'JS',
    );
  });

  it('uses a single initial when only first name is present', () => {
    expect(getAccountInitials({ firstName: 'John' })).toBe('J');
  });

  it('uses a single initial when only last name is present', () => {
    expect(getAccountInitials({ lastName: 'Smith' })).toBe('S');
  });

  it('uppercases initials regardless of input casing', () => {
    expect(getAccountInitials({ firstName: 'john', lastName: 'smith' })).toBe(
      'JS',
    );
  });

  it('falls back to email initials (dot-separated) when no name is present', () => {
    expect(getAccountInitials({ email: 'john.smith@example.com' })).toBe('JS');
  });

  it('falls back to email initials (underscore-separated)', () => {
    expect(getAccountInitials({ email: 'john_smith@example.com' })).toBe('JS');
  });

  it('falls back to email initials (dash-separated)', () => {
    expect(getAccountInitials({ email: 'john-smith@example.com' })).toBe('JS');
  });

  it('uses the first two characters of a single-word email local part', () => {
    expect(getAccountInitials({ email: 'johnsmith@example.com' })).toBe('JO');
  });

  it('returns "?" when there is no name and no email at all', () => {
    expect(getAccountInitials({})).toBe('?');
  });

  it('returns "?" when email has no local part before the @', () => {
    expect(getAccountInitials({ email: '@example.com' })).toBe('?');
  });

  it('prefers name-based initials over email-based initials', () => {
    expect(
      getAccountInitials({
        firstName: 'John',
        lastName: 'Smith',
        email: 'someone.else@example.com',
      }),
    ).toBe('JS');
  });
});
