import { formatLastActivity, pickLastActivityIso } from './formatLastActivity';

describe('pickLastActivityIso', () => {
  it('returns the latest non-empty timestamp', () => {
    expect(
      pickLastActivityIso(
        '2024-01-01T00:00:00.000Z',
        '2024-06-01T00:00:00.000Z',
        undefined,
      ),
    ).toBe('2024-06-01T00:00:00.000Z');
  });

  it('returns undefined when all values are empty', () => {
    expect(pickLastActivityIso(undefined, null, '')).toBeUndefined();
  });
});

describe('formatLastActivity', () => {
  it('formats a valid ISO date', () => {
    const formatted = formatLastActivity('2024-06-15T12:00:00.000Z');
    expect(formatted).toBeTruthy();
    expect(formatted).toContain('2024');
  });

  it('returns undefined for missing or invalid input', () => {
    expect(formatLastActivity(undefined)).toBeUndefined();
    expect(formatLastActivity('not-a-date')).toBeUndefined();
  });
});
