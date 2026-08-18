import {
  emitAuthSessionExpired,
  emitAuthReauthRequired,
  emitAuthReauthResolved,
  onAuthSessionExpired,
  onAuthReauthRequired,
  onAuthReauthResolved,
} from './syncEvents';

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

describe('syncEvents auth reauth required', () => {
  it('notifies listeners with the user id', () => {
    const listener = jest.fn();
    const unsubscribe = onAuthReauthRequired(listener);

    emitAuthReauthRequired('42');

    expect(listener).toHaveBeenCalledWith('42');

    unsubscribe();
    emitAuthReauthRequired('42');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('syncEvents auth reauth resolved', () => {
  it('notifies listeners when reauth is cleared', () => {
    const listener = jest.fn();
    const unsubscribe = onAuthReauthResolved(listener);

    emitAuthReauthResolved('42');

    expect(listener).toHaveBeenCalledWith('42');

    unsubscribe();
    emitAuthReauthResolved('42');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
