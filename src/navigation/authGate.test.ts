import {
  AUTH_LOGIN_HREF,
  APP_HOME_HREF,
  classifyRouteGroups,
  getAuthGateDecision,
} from './authGate';

describe('classifyRouteGroups', () => {
  it.each([
    [['(auth)', 'login'], true, false],
    [['(app)', '(stack)', 'settings'], false, true],
    [[], false, false],
  ] as const)('%j', (segments, inAuthGroup, inAppGroup) => {
    expect(classifyRouteGroups(segments)).toEqual({ inAuthGroup, inAppGroup });
  });
});

describe('getAuthGateDecision', () => {
  const base = {
    isLoading: false,
    isAuthenticated: false,
    inAuthGroup: false,
    inAppGroup: false,
  };

  it.each([
    [{ ...base, isLoading: true, inAppGroup: true }, { action: 'wait' }],
    [
      { ...base, inAppGroup: true },
      { action: 'redirect', href: AUTH_LOGIN_HREF },
    ],
    [
      { ...base, isAuthenticated: true, inAuthGroup: true },
      { action: 'redirect', href: APP_HOME_HREF },
    ],
    [{ ...base, inAuthGroup: true }, { action: 'allow' }],
    [{ ...base, isAuthenticated: true, inAppGroup: true }, { action: 'allow' }],
    [base, { action: 'allow' }],
  ])('%#', (input, expected) => {
    expect(getAuthGateDecision(input)).toEqual(expected);
  });
});
