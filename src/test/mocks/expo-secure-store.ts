const store = new Map<string, string>();

export function resetSecureStoreMock(): void {
  store.clear();
}

export async function setItemAsync(
  key: string,
  value: string,
  _options?: unknown,
): Promise<void> {
  store.set(key, value);
}

export async function getItemAsync(
  key: string,
  _options?: unknown,
): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function deleteItemAsync(
  key: string,
  _options?: unknown,
): Promise<void> {
  store.delete(key);
}

/** Test-only helper to inspect stored values. */
export function __getSecureStoreSnapshot(): ReadonlyMap<string, string> {
  return store;
}
