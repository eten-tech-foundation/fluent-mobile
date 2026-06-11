export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is required. Copy .env.example to .env and set EXPO_PUBLIC_API_BASE_URL.',
    );
  }
  return url;
}

export const API_BASE_URL = getApiBaseUrl();
