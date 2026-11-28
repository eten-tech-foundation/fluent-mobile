import React from 'react';
import { renderHook } from '@testing-library/react-native';

jest.mock('../services/userPreferences', () => {
  throw new Error('Presentation theme must not import persistent preferences');
});

import { ColorModeScope, useTheme } from './useTheme';
import { nextTheme, nextThemes } from './next';

describe('presentation theme without native preference storage', () => {
  it('resolves Hardware and a scoped mode without importing preferences', async () => {
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toBe(nextTheme);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ColorModeScope value="canvas">{children}</ColorModeScope>
    );
    const scoped = await renderHook(() => useTheme(), { wrapper });
    expect(scoped.result.current).toBe(nextThemes.canvas);
  });
});
