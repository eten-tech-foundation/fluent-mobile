let focusEffectCallback: (() => void | (() => void)) | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    focusEffectCallback = callback;
  },
}));

jest.mock('../services/storage', () => ({
  isReauthRequiredForActiveUser: jest.fn(),
}));

jest.mock('../services/syncEvents', () => ({
  onAuthReauthRequired: jest.fn(),
  onAuthReauthResolved: jest.fn(),
}));

import { act, renderHook } from '@testing-library/react-native';
import { isReauthRequiredForActiveUser } from '../services/storage';
import {
  onAuthReauthRequired,
  onAuthReauthResolved,
} from '../services/syncEvents';
import { useReauthRequired } from './useReauthRequired';

describe('useReauthRequired', () => {
  let reauthRequiredListener: (userId: string) => void;
  let reauthResolvedListener: (userId: string) => void;

  beforeEach(() => {
    focusEffectCallback = undefined;
    jest.clearAllMocks();
    jest.mocked(isReauthRequiredForActiveUser).mockReturnValue(false);
    jest.mocked(onAuthReauthRequired).mockImplementation(listener => {
      reauthRequiredListener = listener;
      return jest.fn();
    });
    jest.mocked(onAuthReauthResolved).mockImplementation(listener => {
      reauthResolvedListener = listener;
      return jest.fn();
    });
  });

  it('reflects the current reauth flag on mount', () => {
    jest.mocked(isReauthRequiredForActiveUser).mockReturnValue(true);

    const { result } = renderHook(() => useReauthRequired());

    expect(result.current.reauthRequired).toBe(true);
    expect(onAuthReauthRequired).toHaveBeenCalled();
    expect(onAuthReauthResolved).toHaveBeenCalled();
  });

  it('updates when auth reauth required and resolved events fire', () => {
    const { result } = renderHook(() => useReauthRequired());

    act(() => {
      jest.mocked(isReauthRequiredForActiveUser).mockReturnValue(true);
      reauthRequiredListener('2');
    });
    expect(result.current.reauthRequired).toBe(true);

    act(() => {
      jest.mocked(isReauthRequiredForActiveUser).mockReturnValue(false);
      reauthResolvedListener('2');
    });
    expect(result.current.reauthRequired).toBe(false);
  });

  it('refreshes on focus when refreshOnFocus is enabled', () => {
    jest.mocked(isReauthRequiredForActiveUser).mockReturnValue(false);

    const { result } = renderHook(() =>
      useReauthRequired({ refreshOnFocus: true }),
    );

    expect(focusEffectCallback).toBeDefined();

    act(() => {
      jest.mocked(isReauthRequiredForActiveUser).mockReturnValue(true);
      focusEffectCallback?.();
    });

    expect(result.current.reauthRequired).toBe(true);
  });
});
