import { isDevPreviewChapterConflictEnabled } from './devPreviewChapterConflict';

describe('isDevPreviewChapterConflictEnabled', () => {
  const originalDev = (globalThis as { __DEV__?: boolean }).__DEV__;

  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = originalDev;
    delete process.env.EXPO_PUBLIC_DEV_PREVIEW_CHAPTER_CONFLICT;
  });

  it('is false when __DEV__ is false, even with the env flag set', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_DEV_PREVIEW_CHAPTER_CONFLICT = 'true';
    expect(isDevPreviewChapterConflictEnabled()).toBe(false);
  });

  it('is false when __DEV__ is true but the env flag is unset', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    expect(isDevPreviewChapterConflictEnabled()).toBe(false);
  });

  it('is true only when __DEV__ is true and the env flag is "true"', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    process.env.EXPO_PUBLIC_DEV_PREVIEW_CHAPTER_CONFLICT = 'true';
    expect(isDevPreviewChapterConflictEnabled()).toBe(true);
  });
});
