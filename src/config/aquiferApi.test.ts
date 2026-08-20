type AquiferExtra = {
  aquiferApiKey?: string;
  aquiferApiBaseUrl?: string;
};

const constantsState: {
  expoConfig: { extra: AquiferExtra } | null;
  manifest: { extra?: AquiferExtra } | null;
} = {
  expoConfig: { extra: {} },
  manifest: null,
};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return constantsState.expoConfig;
    },
    set expoConfig(value: { extra: AquiferExtra } | null) {
      constantsState.expoConfig = value;
    },
    get manifest() {
      return constantsState.manifest;
    },
    set manifest(value: { extra?: AquiferExtra } | null) {
      constantsState.manifest = value;
    },
  },
}));

import { getAquiferApiBaseUrl, getAquiferApiKey } from './aquiferApi';

describe('aquiferApi config', () => {
  const originalKey = process.env.AQUIFER_API_KEY;
  const originalBase = process.env.EXPO_PUBLIC_AQUIFER_API_BASE_URL;

  beforeEach(() => {
    constantsState.expoConfig = { extra: {} };
    constantsState.manifest = null;
    delete process.env.AQUIFER_API_KEY;
    delete process.env.EXPO_PUBLIC_AQUIFER_API_BASE_URL;
  });

  afterAll(() => {
    process.env.AQUIFER_API_KEY = originalKey;
    process.env.EXPO_PUBLIC_AQUIFER_API_BASE_URL = originalBase;
  });

  it('reads AQUIFER_API_KEY from expo-constants extra', () => {
    constantsState.expoConfig = { extra: { aquiferApiKey: 'from-extra' } };
    expect(getAquiferApiKey()).toBe('from-extra');
  });

  it('falls back to process.env.AQUIFER_API_KEY', () => {
    process.env.AQUIFER_API_KEY = 'from-env';
    expect(getAquiferApiKey()).toBe('from-env');
  });

  it('throws when the Aquifer key is missing', () => {
    expect(() => getAquiferApiKey()).toThrow(/AQUIFER_API_KEY is required/);
  });

  it('prefers extra base URL then env then default', () => {
    expect(getAquiferApiBaseUrl()).toBe('https://api.aquifer.bible');

    process.env.EXPO_PUBLIC_AQUIFER_API_BASE_URL = 'https://env.aquifer.test/';
    expect(getAquiferApiBaseUrl()).toBe('https://env.aquifer.test');

    constantsState.expoConfig = {
      extra: { aquiferApiBaseUrl: 'https://extra.aquifer.test/' },
    };
    expect(getAquiferApiBaseUrl()).toBe('https://extra.aquifer.test');
  });

  it('reads extra from legacy Constants.manifest when expoConfig is absent', () => {
    constantsState.expoConfig = null;
    constantsState.manifest = { extra: { aquiferApiKey: 'from-manifest' } };
    expect(getAquiferApiKey()).toBe('from-manifest');
  });
});
