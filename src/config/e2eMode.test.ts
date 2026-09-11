import { isE2eModeEnabled } from './e2eMode';

describe('isE2eModeEnabled', () => {
  const original = process.env.EXPO_PUBLIC_E2E_MODE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_E2E_MODE;
    } else {
      process.env.EXPO_PUBLIC_E2E_MODE = original;
    }
  });

  it('is false when unset', () => {
    delete process.env.EXPO_PUBLIC_E2E_MODE;
    expect(isE2eModeEnabled()).toBe(false);
  });

  it('is true for 1 and true in __DEV__', () => {
    // Jest / jest-expo runs with __DEV__ === true.
    expect(__DEV__).toBe(true);
    process.env.EXPO_PUBLIC_E2E_MODE = '1';
    expect(isE2eModeEnabled()).toBe(true);
    process.env.EXPO_PUBLIC_E2E_MODE = 'true';
    expect(isE2eModeEnabled()).toBe(true);
  });

  it('is false for other values', () => {
    process.env.EXPO_PUBLIC_E2E_MODE = 'yes';
    expect(isE2eModeEnabled()).toBe(false);
  });
});
