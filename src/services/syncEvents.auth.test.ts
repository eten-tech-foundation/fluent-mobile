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

  it('invokes all listeners registered at emit time even if one unsubscribes mid-flight', () => {
    const first = jest.fn();
    const second = jest.fn();
    const third = jest.fn();

    const unsubFirst = onAuthSessionExpired(first);
    let unsubThird = () => {};
    const unsubSecond = onAuthSessionExpired(() => {
      second();
      unsubThird();
    });
    unsubThird = onAuthSessionExpired(third);

    emitAuthSessionExpired();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).toHaveBeenCalledTimes(1);

    unsubFirst();
    unsubSecond();
    unsubThird();
  });
});
