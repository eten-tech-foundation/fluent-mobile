import { renderHook, act } from '@testing-library/react-native';
import { usePreference, usePreferences } from './usePreferences';
import {
  notifyUserPreferencesChanged,
  setUserPreferences,
} from '../services/userPreferences';
import { kvStorage } from '../services/storage';
import { mockPreferenceStore } from '../test/mocks/preferenceStore';

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const mockSetItemSync = kvStorage.setItemSync as jest.Mock;

describe('usePreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  it('returns preferences from storage', () => {
    mockPreferenceStore({
      pref_upload_over_cellular: 'true',
      pref_ui_version: 'next',
    });

    const { result } = renderHook(() => usePreferences());

    expect(result.current.uploadOverCellular).toBe(true);
    expect(result.current.uiVersion).toBe('next');
    expect(result.current.preferences).toEqual({
      uploadOverCellular: true,
      uiVersion: 'next',
    });
  });

  it('persists and updates upload over cellular', () => {
    const { result } = renderHook(() => usePreferences());

    act(() => {
      result.current.setUploadOverCellular(true);
    });

    expect(mockSetItemSync).toHaveBeenCalledWith(
      'pref_upload_over_cellular',
      'true',
    );
    expect(result.current.uploadOverCellular).toBe(true);
  });

  it('persists and updates uiVersion', () => {
    const { result } = renderHook(() => usePreferences());

    expect(result.current.uiVersion).toBe('legacy');

    act(() => {
      result.current.setUiVersion('next');
    });

    expect(mockSetItemSync).toHaveBeenCalledWith('pref_ui_version', 'next');
    expect(result.current.uiVersion).toBe('next');
  });

  it('reload refreshes preferences from storage', () => {
    const { result } = renderHook(() => usePreferences());

    mockPreferenceStore({ pref_upload_over_cellular: 'true' });

    act(() => {
      result.current.reload();
    });

    expect(result.current.uploadOverCellular).toBe(true);
  });
});

describe('usePreference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  it('returns a single preference value', () => {
    mockPreferenceStore({ pref_upload_over_cellular: 'true' });

    const { result } = renderHook(() => usePreference('uploadOverCellular'));

    expect(result.current).toBe(true);
  });

  it('updates when the preference changes in storage', () => {
    const { result } = renderHook(() => usePreference('uploadOverCellular'));

    expect(result.current).toBe(false);

    act(() => {
      setUserPreferences({ uploadOverCellular: true });
    });

    expect(result.current).toBe(true);
  });

  it('does not update when storage is unchanged', () => {
    let latestValue = false;

    const { rerender } = renderHook(() => {
      latestValue = usePreference('uploadOverCellular');
    });

    expect(latestValue).toBe(false);

    act(() => {
      notifyUserPreferencesChanged();
    });

    rerender({});
    expect(latestValue).toBe(false);
  });
});
