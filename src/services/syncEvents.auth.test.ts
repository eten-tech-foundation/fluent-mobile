import {
  emitAuthReauthRequired,
  emitAuthReauthResolved,
  onAuthReauthRequired,
  onAuthReauthResolved,
} from './syncEvents';

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

  it('invokes all listeners registered at emit time even if one unsubscribes mid-flight', () => {
    const first = jest.fn();
    const second = jest.fn();
    const third = jest.fn();

    const unsubFirst = onAuthReauthRequired(first);
    let unsubThird = () => {};
    const unsubSecond = onAuthReauthRequired(() => {
      second('2');
      unsubThird();
    });
    unsubThird = onAuthReauthRequired(third);

    emitAuthReauthRequired('2');

    expect(first).toHaveBeenCalledWith('2');
    expect(second).toHaveBeenCalledWith('2');
    expect(third).toHaveBeenCalledWith('2');

    unsubFirst();
    unsubSecond();
    unsubThird();
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
