import {
  AUTH_LOGIN_HREF,
  APP_HOME_HREF,
  classifyRouteGroups,
  getAuthGateDecision,
} from './authGate';

describe('classifyRouteGroups', () => {
  it('detects the auth group', () => {
    expect(classifyRouteGroups(['(auth)', 'login'])).toEqual({
      inAuthGroup: true,
      inAppGroup: false,
    });
  });

  it('detects the app group', () => {
    expect(classifyRouteGroups(['(app)', '(stack)', 'settings'])).toEqual({
      inAuthGroup: false,
      inAppGroup: true,
    });
  });

  it('handles empty segments', () => {
    expect(classifyRouteGroups([])).toEqual({
      inAuthGroup: false,
      inAppGroup: false,
    });
  });
});

describe('getAuthGateDecision', () => {
  it('waits while session bootstrap is loading', () => {
    expect(
      getAuthGateDecision({
        isLoading: true,
        isAuthenticated: false,
        inAuthGroup: false,
        inAppGroup: true,
      }),
    ).toEqual({ action: 'wait' });
  });

  it('redirects unauthenticated users away from app routes to login', () => {
    expect(
      getAuthGateDecision({
        isLoading: false,
        isAuthenticated: false,
        inAuthGroup: false,
        inAppGroup: true,
      }),
    ).toEqual({ action: 'redirect', href: AUTH_LOGIN_HREF });
  });

  it('redirects authenticated users away from auth routes to home', () => {
    expect(
      getAuthGateDecision({
        isLoading: false,
        isAuthenticated: true,
        inAuthGroup: true,
        inAppGroup: false,
      }),
    ).toEqual({ action: 'redirect', href: APP_HOME_HREF });
  });

  it('allows unauthenticated users on auth routes', () => {
    expect(
      getAuthGateDecision({
        isLoading: false,
        isAuthenticated: false,
        inAuthGroup: true,
        inAppGroup: false,
      }),
    ).toEqual({ action: 'allow' });
  });

  it('allows authenticated users on app routes', () => {
    expect(
      getAuthGateDecision({
        isLoading: false,
        isAuthenticated: true,
        inAuthGroup: false,
        inAppGroup: true,
      }),
    ).toEqual({ action: 'allow' });
  });

  it('allows the root index (neither group) without redirecting', () => {
    expect(
      getAuthGateDecision({
        isLoading: false,
        isAuthenticated: false,
        inAuthGroup: false,
        inAppGroup: false,
      }),
    ).toEqual({ action: 'allow' });
  });
});
