import React from 'react';
import { renderHook } from '@testing-library/react-native';

jest.mock('../services/userPreferences', () => {
  throw new Error('Presentation theme must not import persistent preferences');
});

import { UiVersionOverride, useTheme } from './useTheme';
import { legacyTheme } from './legacy';
import { nextTheme } from './next';

describe('presentation theme without native preference storage', () => {
  it('resolves default and explicitly scoped themes without importing preferences', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current).toBe(legacyTheme);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UiVersionOverride value="next">{children}</UiVersionOverride>
    );
    const scoped = renderHook(() => useTheme(), { wrapper });
    expect(scoped.result.current).toBe(nextTheme);
  });
});
