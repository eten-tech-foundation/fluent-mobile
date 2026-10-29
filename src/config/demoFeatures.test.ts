import { isDemoFeatureEnabled } from './demoFeatures';

describe('isDemoFeatureEnabled', () => {
  const envKey = 'EXPO_PUBLIC_DEMO_PREPARE_OFFLINE_AUTO_PROMPT';
  const original = process.env[envKey];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = original;
    }
  });

  it('is false when unset (default off)', () => {
    delete process.env[envKey];
    expect(isDemoFeatureEnabled('prepareOfflineAutoPrompt')).toBe(false);
  });

  it('is false for values other than 1 / true', () => {
    process.env[envKey] = 'false';
    expect(isDemoFeatureEnabled('prepareOfflineAutoPrompt')).toBe(false);
    process.env[envKey] = 'yes';
    expect(isDemoFeatureEnabled('prepareOfflineAutoPrompt')).toBe(false);
  });

  it('is true for 1 and true (case-insensitive, trimmed)', () => {
    process.env[envKey] = '1';
    expect(isDemoFeatureEnabled('prepareOfflineAutoPrompt')).toBe(true);
    process.env[envKey] = 'TRUE';
    expect(isDemoFeatureEnabled('prepareOfflineAutoPrompt')).toBe(true);
    process.env[envKey] = ' true ';
    expect(isDemoFeatureEnabled('prepareOfflineAutoPrompt')).toBe(true);
  });
});
