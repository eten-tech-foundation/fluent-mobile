import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getUserPreferenceValue,
  notifyUserPreferencesChanged,
  setUserPreferences,
  subscribeToUserPreferences,
  type UserPreferences,
} from '../services/userPreferences';

export function usePreference<K extends keyof UserPreferences>(
  key: K,
): UserPreferences[K] {
  return useSyncExternalStore(
    subscribeToUserPreferences,
    () => getUserPreferenceValue(key),
    () => getUserPreferenceValue(key),
  );
}

export function usePreferences() {
  const uploadOverCellular = usePreference('uploadOverCellular');

  const preferences = useMemo(
    (): UserPreferences => ({ uploadOverCellular }),
    [uploadOverCellular],
  );

  useFocusEffect(
    useCallback(() => {
      notifyUserPreferencesChanged();
    }, []),
  );

  const setPreferences = useCallback((updates: Partial<UserPreferences>) => {
    setUserPreferences(updates);
  }, []);

  const setUploadOverCellular = useCallback(
    (enabled: boolean) => {
      setPreferences({ uploadOverCellular: enabled });
    },
    [setPreferences],
  );

  return {
    preferences,
    uploadOverCellular,
    setPreferences,
    setUploadOverCellular,
    reload: notifyUserPreferencesChanged,
  };
}
