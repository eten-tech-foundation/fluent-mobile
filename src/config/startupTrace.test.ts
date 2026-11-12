import { isStartupTraceEnabled } from './startupTrace';

describe('isStartupTraceEnabled', () => {
  const original = process.env.EXPO_PUBLIC_STARTUP_TRACE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_STARTUP_TRACE;
    } else {
      process.env.EXPO_PUBLIC_STARTUP_TRACE = original;
    }
  });

  it('is off when unset', () => {
    delete process.env.EXPO_PUBLIC_STARTUP_TRACE;
    expect(isStartupTraceEnabled()).toBe(false);
  });

  it('is off for empty and other values', () => {
    for (const value of ['', '0', 'false', 'yes']) {
      process.env.EXPO_PUBLIC_STARTUP_TRACE = value;
      expect(isStartupTraceEnabled()).toBe(false);
    }
  });

  it('is on for 1 and true', () => {
    for (const value of ['1', 'true']) {
      process.env.EXPO_PUBLIC_STARTUP_TRACE = value;
      expect(isStartupTraceEnabled()).toBe(true);
    }
  });
});
