import { renderHook, act } from '@testing-library/react-native';
import { useTheme, useThemedStyles, useUiVersion } from './useTheme';
import { setUiVersion } from '../services/userPreferences';
import { kvStorage } from '../services/storage';
import { legacyTheme } from './legacy';
import { nextTheme } from './next';

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const mockGetItemSync = kvStorage.getItemSync as jest.Mock;
const mockSetItemSync = kvStorage.setItemSync as jest.Mock;

function mockPreferenceStore(initial: Record<string, string | null> = {}) {
  const store: Record<string, string | null> = { ...initial };
  mockGetItemSync.mockImplementation((key: string) => store[key] ?? null);
  mockSetItemSync.mockImplementation((key: string, value: string) => {
    store[key] = value;
  });
  return store;
}

describe('useUiVersion / useTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  it('defaults to legacy theme', () => {
    const { result } = renderHook(() => ({
      version: useUiVersion(),
      theme: useTheme(),
    }));

    expect(result.current.version).toBe('legacy');
    expect(result.current.theme).toBe(legacyTheme);
  });

  it('switches theme at runtime without remounting', () => {
    const { result } = renderHook(() => ({
      version: useUiVersion(),
      theme: useTheme(),
    }));

    expect(result.current.theme).toBe(legacyTheme);

    act(() => {
      setUiVersion('next');
    });

    expect(result.current.version).toBe('next');
    expect(result.current.theme).toBe(nextTheme);
  });
});

describe('useThemedStyles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  it('recomputes styles when UI version changes', () => {
    const { result } = renderHook(() =>
      useThemedStyles(activeTheme => ({
        screen: { backgroundColor: activeTheme.colors.background },
      })),
    );

    const legacyStyles = result.current;

    act(() => {
      setUiVersion('next');
    });

    // Next currently shares Legacy colors, but StyleSheet.create still runs again.
    expect(result.current).not.toBe(legacyStyles);
    expect(result.current.screen).toEqual(legacyStyles.screen);
  });

  it('keeps the same style object when the theme does not change', () => {
    const { result, rerender } = renderHook(() =>
      useThemedStyles(activeTheme => ({
        screen: { backgroundColor: activeTheme.colors.background },
      })),
    );

    const first = result.current;
    rerender({});
    expect(result.current).toBe(first);
  });
});
