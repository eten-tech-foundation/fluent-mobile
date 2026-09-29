import {
  emitRecordingDataChanged,
  getRecordingDataVersion,
  onRecordingDataChanged,
} from './recordingDataEvents';

describe('recordingDataEvents', () => {
  it('starts at version 0', () => {
    expect(getRecordingDataVersion()).toBe(0);
  });

  it('bumps the version on each emit', () => {
    const before = getRecordingDataVersion();
    emitRecordingDataChanged();
    expect(getRecordingDataVersion()).toBe(before + 1);
    emitRecordingDataChanged();
    expect(getRecordingDataVersion()).toBe(before + 2);
  });

  it('notifies every subscriber on emit', () => {
    const first = jest.fn();
    const second = jest.fn();
    const unsubFirst = onRecordingDataChanged(first);
    const unsubSecond = onRecordingDataChanged(second);

    emitRecordingDataChanged();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubFirst();
    unsubSecond();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = onRecordingDataChanged(listener);

    unsubscribe();
    emitRecordingDataChanged();

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not skip later listeners when one unsubscribes mid-emit', () => {
    const later = jest.fn();
    const unsubLater = onRecordingDataChanged(later);
    const unsubFirst = onRecordingDataChanged(() => {
      unsubLater();
    });

    emitRecordingDataChanged();

    expect(later).toHaveBeenCalledTimes(1);
    unsubFirst();
  });

  it('unsubscribing twice is safe', () => {
    const listener = jest.fn();
    const unsubscribe = onRecordingDataChanged(listener);

    unsubscribe();
    unsubscribe();
    emitRecordingDataChanged();

    expect(listener).not.toHaveBeenCalled();
  });
});
