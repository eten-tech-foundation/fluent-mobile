import { hrefs } from './hrefs';

type AccountSwitchRouter = {
  canDismiss: () => boolean;
  dismissAll: () => void;
  replace: (href: ReturnType<typeof hrefs.home>) => void;
};

/**
 * Clear nested account-scoped screens and land on home after a device
 * account switch (#348). Shared by the drawer menu and drafting switcher.
 */
export function resetNavigationAfterAccountSwitch(
  router: AccountSwitchRouter,
): void {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace(hrefs.home({ newUserLoading: false }));
}
