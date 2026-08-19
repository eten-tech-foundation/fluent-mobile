import { hrefs } from './hrefs';
import { navigateFromReauth, parseReauthReturnTo } from './reauthNavigation';

describe('reauthNavigation', () => {
  describe('parseReauthReturnTo', () => {
    it('accepts home and settings', () => {
      expect(parseReauthReturnTo('home')).toBe('home');
      expect(parseReauthReturnTo('settings')).toBe('settings');
      expect(parseReauthReturnTo(['settings'])).toBe('settings');
    });

    it('returns undefined for unknown values', () => {
      expect(parseReauthReturnTo(undefined)).toBeUndefined();
      expect(parseReauthReturnTo('other')).toBeUndefined();
    });
  });

  describe('navigateFromReauth', () => {
    function createRouter(overrides?: { canGoBack?: () => boolean }) {
      return {
        back: jest.fn(),
        canGoBack: overrides?.canGoBack ?? jest.fn(() => true),
        replace: jest.fn(),
      };
    }

    it('pops reauth then opens settings', () => {
      const router = createRouter();
      navigateFromReauth(router, 'settings');
      expect(router.back).toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledWith(hrefs.settings);
    });

    it('opens settings without back when stack is empty', () => {
      const router = createRouter({ canGoBack: () => false });
      navigateFromReauth(router, 'settings');
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledWith(hrefs.settings);
    });

    it('returns to home via back when opened from home', () => {
      const router = createRouter();
      navigateFromReauth(router, 'home');
      expect(router.back).toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('falls back to home replace when stack cannot go back', () => {
      const router = createRouter({ canGoBack: () => false });
      navigateFromReauth(router, undefined);
      expect(router.replace).toHaveBeenCalledWith(hrefs.home());
    });
  });
});
