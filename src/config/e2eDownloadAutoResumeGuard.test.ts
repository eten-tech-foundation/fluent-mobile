import {
  ENV_E2E_HOLD_DOWNLOAD_AUTO_RESUME,
  isE2eDownloadAutoResumeHoldEnabled,
  type E2eDownloadAutoResumeGuardDeps,
} from './e2eDownloadAutoResumeGuard';

function deps(
  overrides: Partial<E2eDownloadAutoResumeGuardDeps> = {},
): E2eDownloadAutoResumeGuardDeps {
  return {
    isDev: () => true,
    isE2eModeEnabled: () => true,
    getApiBaseUrl: () => 'https://qa.api.fluent.bible',
    getHoldEnv: () => '1',
    ...overrides,
  };
}

describe('isE2eDownloadAutoResumeHoldEnabled', () => {
  const originalHold = process.env.EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME;
  const originalE2e = process.env.EXPO_PUBLIC_E2E_MODE;

  afterEach(() => {
    if (originalHold === undefined) {
      delete process.env.EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME;
    } else {
      process.env.EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME = originalHold;
    }
    if (originalE2e === undefined) {
      delete process.env.EXPO_PUBLIC_E2E_MODE;
    } else {
      process.env.EXPO_PUBLIC_E2E_MODE = originalE2e;
    }
  });

  it('is false by default (production / off path)', () => {
    expect(
      isE2eDownloadAutoResumeHoldEnabled(deps({ getHoldEnv: () => undefined })),
    ).toBe(false);
    expect(
      isE2eDownloadAutoResumeHoldEnabled(deps({ isDev: () => false })),
    ).toBe(false);
    expect(
      isE2eDownloadAutoResumeHoldEnabled(
        deps({ isE2eModeEnabled: () => false }),
      ),
    ).toBe(false);
  });

  it('is true only for DEV + E2E + hold opt-in + exact QA https API', () => {
    expect(isE2eDownloadAutoResumeHoldEnabled(deps())).toBe(true);
    expect(
      isE2eDownloadAutoResumeHoldEnabled(deps({ getHoldEnv: () => 'true' })),
    ).toBe(true);
  });

  it('rejects non-QA or non-https API bases', () => {
    expect(
      isE2eDownloadAutoResumeHoldEnabled(
        deps({ getApiBaseUrl: () => 'https://dev.api.fluent.bible' }),
      ),
    ).toBe(false);
    expect(
      isE2eDownloadAutoResumeHoldEnabled(
        deps({ getApiBaseUrl: () => 'http://qa.api.fluent.bible' }),
      ),
    ).toBe(false);
    expect(
      isE2eDownloadAutoResumeHoldEnabled(
        deps({ getApiBaseUrl: () => 'https://qa.api.fluent.bible.evil.com' }),
      ),
    ).toBe(false);
  });

  it('is false when getApiBaseUrl throws (missing env)', () => {
    expect(
      isE2eDownloadAutoResumeHoldEnabled(
        deps({
          getApiBaseUrl: () => {
            throw new Error('missing');
          },
        }),
      ),
    ).toBe(false);
  });

  it('reads process env via default deps when E2E mode and hold are set', () => {
    process.env.EXPO_PUBLIC_E2E_MODE = '1';
    process.env.EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME = '1';
    // jest.env sets EXPO_PUBLIC_API_BASE_URL — only assert hold+E2E gates via
    // env when the configured base happens to be exact QA; otherwise deps inject.
    expect(ENV_E2E_HOLD_DOWNLOAD_AUTO_RESUME).toBe(
      'EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME',
    );
    expect(
      isE2eDownloadAutoResumeHoldEnabled(
        deps({
          getHoldEnv: () =>
            process.env.EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME,
          isE2eModeEnabled: () => process.env.EXPO_PUBLIC_E2E_MODE === '1',
        }),
      ),
    ).toBe(true);
  });
});
