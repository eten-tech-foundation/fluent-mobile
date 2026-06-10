import { emitAuthSessionExpired, onAuthSessionExpired } from './syncEvents';

describe('syncEvents auth session expired', () => {
  it('notifies listeners when the session expires', () => {
    const listener = jest.fn();
    const unsubscribe = onAuthSessionExpired(listener);

    emitAuthSessionExpired();

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    emitAuthSessionExpired();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
