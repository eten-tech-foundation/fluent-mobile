import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { ColorModeScope, useTheme, useThemedStyles } from './useTheme';
import type { ColorMode } from './colorMode';
import { nextTheme, nextThemes } from './next';

describe('useTheme', () => {
  it('defaults to the Next Hardware theme', async () => {
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toBe(nextTheme);
    expect(result.current).toBe(nextThemes.hardware);
  });
});

describe('useThemedStyles', () => {
  it('recomputes styles when a color-mode scope changes', async () => {
    let mode: ColorMode = 'hardware';
    const { result, rerender } = await renderHook(
      () =>
        useThemedStyles(activeTheme => ({
          screen: { backgroundColor: activeTheme.colors.background },
        })),
      {
        wrapper: ({ children }) => (
          <ColorModeScope value={mode}>{children}</ColorModeScope>
        ),
      },
    );

    const hardwareStyles = result.current;
    expect(hardwareStyles.screen.backgroundColor).toBe(
      nextThemes.hardware.colors.background,
    );

    mode = 'canvas';
    await rerender({});

    expect(result.current).not.toBe(hardwareStyles);
    expect(result.current.screen.backgroundColor).toBe(
      nextThemes.canvas.colors.background,
    );
    expect(hardwareStyles.screen.backgroundColor).toBe(
      nextThemes.hardware.colors.background,
    );

    mode = 'accent';
    await rerender({});
    expect(result.current.screen.backgroundColor).toBe(
      nextThemes.accent.colors.background,
    );
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
  it('resolves the Canvas theme for its subtree', async () => {
    const { result } = await renderHook(() => useTheme(), {
      wrapper: ({ children }) => (
        <ColorModeScope value="canvas">{children}</ColorModeScope>
      ),
    });
    expect(result.current).toBe(nextThemes.canvas);
  });

  it('resolves Accent inside an Accent scope', async () => {
    const { result } = await renderHook(() => useTheme(), {
      wrapper: ({ children }) => (
        <ColorModeScope value="accent">{children}</ColorModeScope>
      ),
    });
    expect(result.current).toBe(nextThemes.accent);
    expect(result.current.roles.bgDefault).not.toBe(
      nextThemes.hardware.roles.bgDefault,
    );
    expect(result.current.roles.bgDefault).not.toBe(
      nextThemes.canvas.roles.bgDefault,
    );
  });

  it('defaults to Hardware without a scope', async () => {
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toBe(nextTheme);
  });
});
