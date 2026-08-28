import { hrefs } from './hrefs';

export type ReauthReturnTo = 'home' | 'settings';

type ReauthRouter = {
  back: () => void;
  canGoBack: () => boolean;
  replace: (
    href: typeof hrefs.settings | ReturnType<typeof hrefs.home>,
  ) => void;
};

/**
 * Leaves the reauth stack screen and returns to the screen that opened it.
 * Settings lives in the drawer (not on the stack), so we pop reauth first
 * then open settings — otherwise Settings back would land on Sign In again.
 */
export function navigateFromReauth(
  router: ReauthRouter,
  returnTo?: ReauthReturnTo,
): void {
  if (returnTo === 'settings') {
    if (router.canGoBack()) {
      router.back();
    }
    router.replace(hrefs.settings);
    return;
  }

  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(hrefs.home());
}

export function parseReauthReturnTo(
  value: string | string[] | undefined,
): ReauthReturnTo | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'home' || raw === 'settings') {
    return raw;
  }
  return undefined;
}
