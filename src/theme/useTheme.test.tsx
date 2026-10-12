import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import {
  ColorModeScope,
  useTheme,
  useThemedStyles,
  useUiVersion,
} from './useTheme';
import { setUiVersion } from '../services/userPreferences';
import { legacyTheme } from './legacy';
import { nextTheme, nextThemes } from './next';
import { mockPreferenceStore } from '../test/mocks/preferenceStore';

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

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

    expect(result.current).not.toBe(legacyStyles);
    expect(result.current.screen.backgroundColor).toBe(
      nextTheme.colors.background,
    );
    expect(legacyStyles.screen.backgroundColor).toBe(
      legacyTheme.colors.background,
    );
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

describe('ColorModeScope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  const canvasWrapper = ({ children }: { children: React.ReactNode }) => (
    <ColorModeScope value="canvas">{children}</ColorModeScope>
  );

  it('resolves the Canvas theme for its subtree in Next', () => {
    act(() => {
      setUiVersion('next');
    });
    const { result } = renderHook(() => useTheme(), { wrapper: canvasWrapper });
    expect(result.current).toBe(nextThemes.canvas);
  });

  it('stays on Legacy when the UI version is Legacy', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: canvasWrapper });
    expect(result.current).toBe(legacyTheme);
  });

  it('defaults to Hardware without a scope', () => {
    act(() => {
      setUiVersion('next');
    });
    const { result } = renderHook(() => useTheme());
    expect(result.current).toBe(nextTheme);
  });
});
