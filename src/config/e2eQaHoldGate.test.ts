import { isE2eQaHoldGateOpen, type E2eQaHoldGateDeps } from './e2eQaHoldGate';

function deps(overrides: Partial<E2eQaHoldGateDeps> = {}): E2eQaHoldGateDeps {
  return {
    isDev: () => true,
    isE2eModeEnabled: () => true,
    getApiBaseUrl: () => 'https://qa.api.fluent.bible',
    ...overrides,
  };
}

describe('isE2eQaHoldGateOpen', () => {
  it.each<[string, string | undefined, Partial<E2eQaHoldGateDeps>, boolean]>([
    ['all gates on', '1', {}, true],
    ['flag "true"', 'true', {}, true],
    ['flag " TRUE " (trimmed, case-insensitive)', ' TRUE ', {}, true],
    [
      'QA base with trailing path',
      '1',
      { getApiBaseUrl: () => 'https://qa.api.fluent.bible/v1' },
      true,
    ],
    ['release build (__DEV__ false)', '1', { isDev: () => false }, false],
    ['E2E mode off', '1', { isE2eModeEnabled: () => false }, false],
    ['flag unset', undefined, {}, false],
    ['flag empty', '', {}, false],
    ['flag "0"', '0', {}, false],
    ['flag "yes"', 'yes', {}, false],
    [
      'dev API host',
      '1',
      { getApiBaseUrl: () => 'https://dev.api.fluent.bible' },
      false,
    ],
    [
      'http QA host',
      '1',
      { getApiBaseUrl: () => 'http://qa.api.fluent.bible' },
      false,
    ],
    [
      'QA host as suffix',
      '1',
      { getApiBaseUrl: () => 'https://qa.api.fluent.bible.evil.com' },
      false,
    ],
    [
      'QA subdomain',
      '1',
      { getApiBaseUrl: () => 'https://x.qa.api.fluent.bible' },
      false,
    ],
    ['unparseable API base', '1', { getApiBaseUrl: () => 'not a url' }, false],
    [
      'API base missing (throws)',
      '1',
      {
        getApiBaseUrl: () => {
          throw new Error('missing');
        },
      },
      false,
    ],
  ])('%s → %s', (_label, flag, overrides, expected) => {
    expect(isE2eQaHoldGateOpen(flag, deps(overrides))).toBe(expected);
  });

  it('does not read the API base when an earlier gate is closed', () => {
    const getApiBaseUrl = jest.fn(() => 'https://qa.api.fluent.bible');
    expect(
      isE2eQaHoldGateOpen('1', deps({ isDev: () => false, getApiBaseUrl })),
    ).toBe(false);
    expect(isE2eQaHoldGateOpen(undefined, deps({ getApiBaseUrl }))).toBe(false);
    expect(getApiBaseUrl).not.toHaveBeenCalled();
  });
});
