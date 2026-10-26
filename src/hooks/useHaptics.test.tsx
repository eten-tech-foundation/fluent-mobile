import React from 'react';
import { Platform } from 'react-native';
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
    Drag_Start: 'drag-start',
    Gesture_End: 'gesture-end',
    Long_Press: 'long-press',
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
  afterEach(() => jest.restoreAllMocks());

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

  it('maps a drag pick-up and drop to the drag haptics in Next', () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
    setUiVersion('next');
    const { result } = renderHook(() => useHaptics());
    result.current.dragStart();
    result.current.dragEnd();
    expect(perform.mock.calls.map(call => call[0])).toEqual([
      'drag-start',
      'gesture-end',
    ]);
  });

  it('falls back to haptics older Android has for a drag', () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(29);
    setUiVersion('next');
    const { result } = renderHook(() => useHaptics());
    result.current.dragStart();
    result.current.dragEnd();
    expect(perform.mock.calls.map(call => call[0])).toEqual([
      'long-press',
      'virtual-key',
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
