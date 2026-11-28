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

  it('returns preferences from storage', async () => {
    mockPreferenceStore({
      pref_upload_over_cellular: 'true',
    });

    const { result } = await renderHook(() => usePreferences());

    expect(result.current.uploadOverCellular).toBe(true);
    expect(result.current.preferences).toEqual({
      uploadOverCellular: true,
    });
  });

  it('persists and updates upload over cellular', async () => {
    const { result } = await renderHook(() => usePreferences());

    await act(() => {
      result.current.setUploadOverCellular(true);
    });

    expect(mockSetItemSync).toHaveBeenCalledWith(
      'pref_upload_over_cellular',
      'true',
    );
    expect(result.current.uploadOverCellular).toBe(true);
  });

  it('reload refreshes preferences from storage', async () => {
    const { result } = await renderHook(() => usePreferences());

    mockPreferenceStore({ pref_upload_over_cellular: 'true' });

    await act(() => {
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

  it('returns a single preference value', async () => {
    mockPreferenceStore({ pref_upload_over_cellular: 'true' });

    const { result } = await renderHook(() =>
      usePreference('uploadOverCellular'),
    );

    expect(result.current).toBe(true);
  });

  it('updates when the preference changes in storage', async () => {
    const { result } = await renderHook(() =>
      usePreference('uploadOverCellular'),
    );

    expect(result.current).toBe(false);

    await act(() => {
      setUserPreferences({ uploadOverCellular: true });
    });

    expect(result.current).toBe(true);
  });

  it('does not update when storage is unchanged', async () => {
    let latestValue = false;

    const { rerender } = await renderHook(() => {
      latestValue = usePreference('uploadOverCellular');
    });

    expect(latestValue).toBe(false);

    await act(() => {
      notifyUserPreferencesChanged();
    });

    await rerender({});
    expect(latestValue).toBe(false);
  });
});
