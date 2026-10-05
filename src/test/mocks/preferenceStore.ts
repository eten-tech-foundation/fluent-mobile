import { kvStorage } from '../../services/storage';

/**
 * Shared in-memory stand-in for `kvStorage` preference keys in unit tests.
 * Call after `jest.mock('../../services/storage' | '../services/storage')`.
 */
export function mockPreferenceStore(
  initial: Record<string, string | null> = {},
): Record<string, string | null> {
  const store: Record<string, string | null> = { ...initial };
  const mockGetItemSync = kvStorage.getItemSync as jest.Mock;
  const mockSetItemSync = kvStorage.setItemSync as jest.Mock;
  mockGetItemSync.mockImplementation((key: string) => store[key] ?? null);
  mockSetItemSync.mockImplementation((key: string, value: string) => {
    store[key] = value;
  });
  return store;
}
