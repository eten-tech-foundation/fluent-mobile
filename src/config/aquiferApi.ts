import Constants from 'expo-constants';

const DEFAULT_AQUIFER_API_BASE_URL = 'https://api.aquifer.bible';

type AquiferConfigExtra = {
  aquiferApiKey?: string;
  aquiferApiBaseUrl?: string;
};

/**
 * Resolve `extra` from the active Expo config.
 * Prefer `expoConfig` (modern); fall back to classic `manifest.extra`.
 */
function getAquiferExtra(): AquiferConfigExtra {
  const fromExpoConfig = Constants.expoConfig?.extra;
  if (fromExpoConfig && typeof fromExpoConfig === 'object') {
    return fromExpoConfig as AquiferConfigExtra;
  }

  const legacyManifest = Constants.manifest as
    | { extra?: AquiferConfigExtra }
    | null
    | undefined;
  if (legacyManifest?.extra && typeof legacyManifest.extra === 'object') {
    return legacyManifest.extra;
  }

  return {};
}

export function getAquiferApiBaseUrl(): string {
  const fromExtra = getAquiferExtra().aquiferApiBaseUrl?.trim();
  const fromEnv = process.env.EXPO_PUBLIC_AQUIFER_API_BASE_URL?.trim();
  return (fromExtra || fromEnv || DEFAULT_AQUIFER_API_BASE_URL).replace(
    /\/+$/,
    '',
  );
}

/**
 * Aquifer API key from EAS/Expo env `AQUIFER_API_KEY` (not EXPO_PUBLIC_).
 *
 * Flow: Expo dashboard / `.env` → `process.env.AQUIFER_API_KEY` when
 * `app.config.ts` resolves → `extra.aquiferApiKey` → expo-constants here.
 */
export function getAquiferApiKey(): string {
  const fromExtra = getAquiferExtra().aquiferApiKey?.trim();
  // Jest / Node scripts may set the var directly without going through extra.
  const fromEnv = process.env.AQUIFER_API_KEY?.trim();
  const key = fromExtra || fromEnv;
  if (!key) {
    throw new Error(
      'AQUIFER_API_KEY is required for Aquifer resource downloads. Set it as an EAS environment variable (or locally in .env — see .env.example).',
    );
  }
  return key;
}
