/** Resolves the Better Auth bearer token from sign-in response fields. */
export function resolveSessionToken(
  headerToken: string | null,
  bodyToken?: string,
): string | undefined {
  if (headerToken) {
    return decodeURIComponent(headerToken);
  }
  return bodyToken;
}
