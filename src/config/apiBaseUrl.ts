export function readApiBaseUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return url || null;
}

export function getApiBaseUrl(): string {
  const url = readApiBaseUrl();
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is required. Copy .env.example to .env and set EXPO_PUBLIC_API_BASE_URL.',
    );
  }
  return url;
}
