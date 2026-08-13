/**
 * Pure auth-gate decisions for Expo Router protected layouts.
 * Kept free of React / router imports so unit tests can cover redirects
 * without mounting navigators.
 */

export type AuthGateInput = {
  /** True while DB/session bootstrap has not finished. */
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Current path is under the unauthenticated `(auth)` group. */
  inAuthGroup: boolean;
  /** Current path is under the authenticated `(app)` group. */
  inAppGroup: boolean;
};

export type AuthGateDecision =
  | { action: 'wait' }
  | { action: 'allow' }
  | { action: 'redirect'; href: '/(auth)/login' | '/(app)/(stack)' };

export const AUTH_LOGIN_HREF = '/(auth)/login' as const;
export const APP_HOME_HREF = '/(app)/(stack)' as const;

/**
 * Decide whether the current location is allowed given auth state.
 *
 * - Loading → wait (keep splash / init UI; do not redirect yet)
 * - Unauthenticated on an app route → login
 * - Authenticated on an auth route → home
 * - Otherwise allow (including shared legal routes within each group)
 */
export function getAuthGateDecision(input: AuthGateInput): AuthGateDecision {
  if (input.isLoading) {
    return { action: 'wait' };
  }

  if (!input.isAuthenticated && input.inAppGroup) {
    return { action: 'redirect', href: AUTH_LOGIN_HREF };
  }

  if (input.isAuthenticated && input.inAuthGroup) {
    return { action: 'redirect', href: APP_HOME_HREF };
  }

  return { action: 'allow' };
}

/**
 * Classify Expo Router segments into auth vs app groups.
 * Segments look like `['(auth)', 'login']` or `['(app)', '(stack)', 'settings']`.
 */
export function classifyRouteGroups(segments: readonly string[]): {
  inAuthGroup: boolean;
  inAppGroup: boolean;
} {
  return {
    inAuthGroup: segments.includes('(auth)'),
    inAppGroup: segments.includes('(app)'),
  };
}
