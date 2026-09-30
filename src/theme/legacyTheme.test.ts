import { legacyTheme, theme } from './legacy';
import { nextTheme } from './next';
import { resolveTheme } from './uiVersion';

describe('legacyTheme', () => {
  it('exports theme as an alias of legacyTheme', () => {
    expect(theme).toBe(legacyTheme);
  });

  it('matches the frozen Legacy snapshot', () => {
    expect(legacyTheme).toMatchSnapshot();
  });
});

describe('resolveTheme', () => {
  it('returns legacyTheme for legacy', () => {
    expect(resolveTheme('legacy')).toBe(legacyTheme);
  });

  it('returns nextTheme for next', () => {
    expect(resolveTheme('next')).toBe(nextTheme);
  });
});

describe('nextTheme', () => {
  it('is a distinct object from legacyTheme (runtime switch identity)', () => {
    expect(nextTheme).not.toBe(legacyTheme);
  });

  it('shares Legacy values when overrides are empty', () => {
    expect(nextTheme.colors).toEqual(legacyTheme.colors);
    expect(nextTheme.spacing).toEqual(legacyTheme.spacing);
    expect(nextTheme.radius).toEqual(legacyTheme.radius);
    expect(nextTheme.typography).toEqual(legacyTheme.typography);
  });
});
