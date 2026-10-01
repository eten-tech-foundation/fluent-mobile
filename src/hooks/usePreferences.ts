import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getUserPreferenceValue,
  notifyUserPreferencesChanged,
  setUserPreferences,
  subscribeToUserPreferences,
  type UiVersion,
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
  const uiVersion = usePreference('uiVersion');

  const preferences = useMemo(
    (): UserPreferences => ({ uploadOverCellular, uiVersion }),
    [uploadOverCellular, uiVersion],
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

  const setUiVersion = useCallback(
    (version: UiVersion) => {
      setPreferences({ uiVersion: version });
    },
    [setPreferences],
  );

  return {
    preferences,
    uploadOverCellular,
    uiVersion,
    setPreferences,
    setUploadOverCellular,
    setUiVersion,
    reload: notifyUserPreferencesChanged,
  };
}
