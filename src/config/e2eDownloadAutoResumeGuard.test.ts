import { isE2eDownloadAutoResumeHoldEnabled } from './e2eDownloadAutoResumeGuard';

const ENV_KEYS = [
  'EXPO_PUBLIC_E2E_MODE',
  'EXPO_PUBLIC_E2E_HOLD_UPLOADS',
  'EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME',
  'EXPO_PUBLIC_API_BASE_URL',
] as const;

describe('isE2eDownloadAutoResumeHoldEnabled', () => {
  const original = Object.fromEntries(
    ENV_KEYS.map(key => [key, process.env[key]]),
  );

  beforeEach(() => {
    process.env.EXPO_PUBLIC_E2E_MODE = '1';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://qa.api.fluent.bible';
    delete process.env.EXPO_PUBLIC_E2E_HOLD_UPLOADS;
    delete process.env.EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it('is off when EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME is unset', () => {
    expect(isE2eDownloadAutoResumeHoldEnabled()).toBe(false);
  });

  it('is on with all gates open and EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME=1', () => {
    process.env.EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME = '1';
    expect(isE2eDownloadAutoResumeHoldEnabled()).toBe(true);
  });

  it('ignores the upload hold flag', () => {
    process.env.EXPO_PUBLIC_E2E_HOLD_UPLOADS = '1';
    expect(isE2eDownloadAutoResumeHoldEnabled()).toBe(false);
  });
});
