import { renderHook, act } from '@testing-library/react-native';
import { usePreference, usePreferences } from './usePreferences';
import {
  notifyUserPreferencesChanged,
  setUserPreferences,
} from '../services/userPreferences';
import { kvStorage } from '../services/storage';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const mockGetItemSync = kvStorage.getItemSync as jest.Mock;
const mockSetItemSync = kvStorage.setItemSync as jest.Mock;

describe('usePreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemSync.mockReturnValue(null);
    mockSetItemSync.mockImplementation((_key, value) => {
      mockGetItemSync.mockReturnValue(value);
    });
  });

  it('returns preferences from storage', () => {
    mockGetItemSync.mockReturnValue('true');

    const { result } = renderHook(() => usePreferences());

    expect(result.current.uploadOverCellular).toBe(true);
    expect(result.current.preferences).toEqual({ uploadOverCellular: true });
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

  it('reload refreshes preferences from storage', () => {
    const { result } = renderHook(() => usePreferences());

    mockGetItemSync.mockReturnValue('true');

    act(() => {
      result.current.reload();
    });

    expect(result.current.uploadOverCellular).toBe(true);
  });
});

describe('usePreference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemSync.mockReturnValue(null);
    mockSetItemSync.mockImplementation((_key, value) => {
      mockGetItemSync.mockReturnValue(value);
    });
  });

  it('returns a single preference value', () => {
    mockGetItemSync.mockReturnValue('true');

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
