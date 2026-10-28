import { isDevPreviewChangesRequestedEnabled } from './devPreviewChangesRequested';

describe('isDevPreviewChangesRequestedEnabled', () => {
  const originalDev = (globalThis as { __DEV__?: boolean }).__DEV__;
  const originalPreviewFlag =
    process.env.EXPO_PUBLIC_DEV_PREVIEW_CHANGES_REQUESTED;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_DEV_PREVIEW_CHANGES_REQUESTED;
  });

  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = originalDev;
    if (originalPreviewFlag === undefined) {
      delete process.env.EXPO_PUBLIC_DEV_PREVIEW_CHANGES_REQUESTED;
    } else {
      process.env.EXPO_PUBLIC_DEV_PREVIEW_CHANGES_REQUESTED =
        originalPreviewFlag;
    }
  });

  it('is false when __DEV__ is false, even with the env flag set', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_DEV_PREVIEW_CHANGES_REQUESTED = 'true';
    expect(isDevPreviewChangesRequestedEnabled()).toBe(false);
  });

  it('is false when __DEV__ is true but the env flag is unset', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    expect(isDevPreviewChangesRequestedEnabled()).toBe(false);
  });

  it('is true only when __DEV__ is true and the env flag is "true"', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    process.env.EXPO_PUBLIC_DEV_PREVIEW_CHANGES_REQUESTED = 'true';
    expect(isDevPreviewChangesRequestedEnabled()).toBe(true);
  });
});
