import { hrefs } from './hrefs';
import { resetNavigationAfterAccountSwitch } from './resetNavigationAfterAccountSwitch';

describe('resetNavigationAfterAccountSwitch', () => {
  it('dismisses nested screens when possible then replaces home', () => {
    const dismissAll = jest.fn();
    const replace = jest.fn();
    const canDismiss = jest.fn(() => true);

    resetNavigationAfterAccountSwitch({ canDismiss, dismissAll, replace });

    expect(canDismiss).toHaveBeenCalled();
    expect(dismissAll).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(hrefs.home({ newUserLoading: false }));
  });

  it('skips dismissAll when the stack cannot dismiss', () => {
    const dismissAll = jest.fn();
    const replace = jest.fn();

    resetNavigationAfterAccountSwitch({
      canDismiss: () => false,
      dismissAll,
      replace,
    });

    expect(dismissAll).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(hrefs.home({ newUserLoading: false }));
  });
});
