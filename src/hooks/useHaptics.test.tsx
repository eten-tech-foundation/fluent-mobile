import React from 'react';
import { renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { useHaptics } from './useHaptics';
import { setMicActive } from '../audio/micActivity';
import { setUiVersion } from '../services/userPreferences';
import { UiVersionOverride } from '../theme/useTheme';
import { mockPreferenceStore } from '../test/mocks/preferenceStore';

jest.mock('expo-haptics', () => ({
  AndroidHaptics: {
    Virtual_Key: 'virtual-key',
    Toggle_On: 'toggle-on',
    Toggle_Off: 'toggle-off',
  },
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const perform = jest.mocked(Haptics.performAndroidHapticsAsync);

describe('useHaptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
    setMicActive('test', false);
    setMicActive('other', false);
  });

  it('is a no-op in Legacy', () => {
    const { result } = renderHook(() => useHaptics());
    result.current.press();
    expect(perform).not.toHaveBeenCalled();
  });

  it('fires the virtual key haptic in Next', () => {
    setUiVersion('next');
    const { result } = renderHook(() => useHaptics());
    result.current.press();
    expect(perform).toHaveBeenCalledWith('virtual-key');
  });

  it('maps toggle to the on and off haptics in Next', () => {
    setUiVersion('next');
    const { result } = renderHook(() => useHaptics());
    result.current.toggle(true);
    result.current.toggle(false);
    expect(perform.mock.calls.map(call => call[0])).toEqual([
      'toggle-on',
      'toggle-off',
    ]);
  });

  it('follows a UiVersionOverride even when the preference is Legacy', () => {
    const { result } = renderHook(() => useHaptics(), {
      wrapper: ({ children }) => (
        <UiVersionOverride value="next">{children}</UiVersionOverride>
      ),
    });
    result.current.press();
    expect(perform).toHaveBeenCalledWith('virtual-key');
  });

  it('stays silent until every mic owner has closed', () => {
    setUiVersion('next');
    setMicActive('test', true);
    setMicActive('other', true);
    setMicActive('test', false);
    const { result } = renderHook(() => useHaptics());
    result.current.press();
    expect(perform).not.toHaveBeenCalled();

    setMicActive('other', false);
    result.current.press();
    expect(perform).toHaveBeenCalledWith('virtual-key');
  });

  it('stays silent while the mic is active', () => {
    setUiVersion('next');
    setMicActive('test', true);
    const { result } = renderHook(() => useHaptics());
    result.current.press();
    expect(perform).not.toHaveBeenCalled();
  });
});
