/** Resolves the Better Auth bearer token from sign-in response fields. */
export function resolveSessionToken(
  headerToken: string | null,
  bodyToken?: string,
): string | undefined {
  if (headerToken) {
    try {
      return decodeURIComponent(headerToken);
    } catch {
      return bodyToken;
    }
  }
  return bodyToken;
}
