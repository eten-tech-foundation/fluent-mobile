import {
  getRecordCaptureGate,
  resetRecordCaptureGateForTests,
  setRecordCaptureGate,
  subscribeRecordCaptureGate,
} from './recordCaptureGate';

describe('recordCaptureGate', () => {
  beforeEach(() => {
    resetRecordCaptureGateForTests();
  });

  it('defaults to inactive and notifies subscribers on change', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeRecordCaptureGate(listener);

    expect(getRecordCaptureGate()).toBe(false);

    setRecordCaptureGate(true);
    expect(getRecordCaptureGate()).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);

    setRecordCaptureGate(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setRecordCaptureGate(false);
    expect(getRecordCaptureGate()).toBe(false);
    expect(listener).toHaveBeenCalledWith(false);

    unsubscribe();
    setRecordCaptureGate(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
