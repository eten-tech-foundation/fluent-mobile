import React from 'react';
import {
  renderHook as renderHookBase,
  act,
} from '@testing-library/react-native';
import {
  ColorModeScope,
  useTheme,
  useThemedStyles,
  useUiVersion,
} from './useTheme';
import { setUiVersion } from '../services/userPreferences';
import { legacyTheme } from './legacy';
import { nextTheme, nextThemes } from './next';
import { UiVersionPreferenceProvider } from './UiVersionPreferenceProvider';
import { mockPreferenceStore } from '../test/mocks/preferenceStore';

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

function renderHook<T>(
  callback: () => T,
  options?: { wrapper: React.ComponentType<{ children: React.ReactNode }> },
) {
  const Scope = options?.wrapper;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <UiVersionPreferenceProvider>
      {Scope ? <Scope>{children}</Scope> : children}
    </UiVersionPreferenceProvider>
  );
  return renderHookBase(callback, { wrapper });
}

describe('useUiVersion / useTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  it('defaults to the Next theme', async () => {
    const { result } = await renderHook(() => ({
      version: useUiVersion(),
      theme: useTheme(),
    }));

    expect(result.current.version).toBe('next');
    expect(result.current.theme).toBe(nextTheme);
  });

  it('keeps an explicit stored Legacy choice', async () => {
    mockPreferenceStore({ pref_ui_version: 'legacy' });
    const { result } = await renderHook(() => ({
      version: useUiVersion(),
      theme: useTheme(),
    }));

    expect(result.current.version).toBe('legacy');
    expect(result.current.theme).toBe(legacyTheme);
  });

  it('loads a persisted Next preference when the root bridge mounts', async () => {
    mockPreferenceStore({ pref_ui_version: 'next' });
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toBe(nextTheme);
  });

  it('switches theme at runtime without remounting', async () => {
    const { result } = await renderHook(() => ({
      version: useUiVersion(),
      theme: useTheme(),
    }));

    expect(result.current.theme).toBe(nextTheme);

    await act(() => {
      setUiVersion('legacy');
    });

    expect(result.current.version).toBe('legacy');
    expect(result.current.theme).toBe(legacyTheme);
  });
});

describe('useThemedStyles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  it('recomputes styles when UI version changes', async () => {
    const { result } = await renderHook(() =>
      useThemedStyles(activeTheme => ({
        screen: { backgroundColor: activeTheme.colors.background },
      })),
    );

    const nextStyles = result.current;

    await act(() => {
      setUiVersion('legacy');
    });

    expect(result.current).not.toBe(nextStyles);
    expect(result.current.screen.backgroundColor).toBe(
      legacyTheme.colors.background,
    );
    expect(nextStyles.screen.backgroundColor).toBe(nextTheme.colors.background);
  });

  it('keeps the same style object when the theme does not change', async () => {
    const { result, rerender } = await renderHook(() =>
      useThemedStyles(activeTheme => ({
        screen: { backgroundColor: activeTheme.colors.background },
      })),
    );

    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });
});

describe('ColorModeScope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  const canvasWrapper = ({ children }: { children: React.ReactNode }) => (
    <ColorModeScope value="canvas">{children}</ColorModeScope>
  );

  it('resolves the Canvas theme for its subtree in Next', async () => {
    await act(() => {
      setUiVersion('next');
    });
    const { result } = await renderHook(() => useTheme(), {
      wrapper: canvasWrapper,
    });
    expect(result.current).toBe(nextThemes.canvas);
  });

  it('stays on Legacy when the UI version is Legacy', async () => {
    await act(() => {
      setUiVersion('legacy');
    });
    const { result } = await renderHook(() => useTheme(), {
      wrapper: canvasWrapper,
    });
    expect(result.current).toBe(legacyTheme);
  });

  it('defaults to Hardware without a scope', async () => {
    await act(() => {
      setUiVersion('next');
    });
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toBe(nextTheme);
  });
});
