export function parseApiErrorMessage(
  status: number,
  errorBody: string,
): string {
  try {
    const parsed = JSON.parse(errorBody) as { message?: string };
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    // use raw body below
  }
  return errorBody.trim() || `API failed: ${status}`;
}
