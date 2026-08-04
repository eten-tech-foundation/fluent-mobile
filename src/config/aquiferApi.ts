const DEFAULT_AQUIFER_API_BASE_URL = 'https://api.aquifer.bible';

export function getAquiferApiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_AQUIFER_API_BASE_URL?.trim() ||
    DEFAULT_AQUIFER_API_BASE_URL
  ).replace(/\/+$/, '');
}

export function getAquiferApiKey(): string {
  const key = process.env.EXPO_PUBLIC_AQUIFER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'EXPO_PUBLIC_AQUIFER_API_KEY is required for Aquifer resource downloads.',
    );
  }
  return key;
}
